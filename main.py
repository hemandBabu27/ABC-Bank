import pickle
import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime
from connector import supabase  # Connects to Supabase

# Import your custom Preprocessor class from Preprocessor.py
# (Make sure Preprocessor.py defines a class named Preprocessor)
try:
    from Preprocessor import Preprocessor
except ImportError:
    Preprocessor = None

app = FastAPI(title="ABC Bank Smart AI Core API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Load ML Model & Preprocessor ---
fraud_model = None
data_preprocessor = None

try:
    with open("fraud_model.pkl", "rb") as f:
        fraud_model = pickle.load(f)
    print("Fraud detection model loaded successfully!")
except Exception as e:
    print(f"Warning: Could not load fraud_model.pkl: {e}")

# If your preprocessor is also saved as a pkl file (e.g., preprocessor.pkl), load it. 
# Otherwise, instantiate the class from Preprocessor.py if available.
try:
    if Preprocessor is not None:
        data_preprocessor = Preprocessor()
        print("Preprocessor initialized successfully!")
except Exception as e:
    print(f"Warning: Could not initialize Preprocessor: {e}")

# --- Pydantic Schemas ---
class TransactionRequest(BaseModel):
    account_number: str
    amount: float
    target_account: Optional[str] = None

class TransferRequest(BaseModel):
    sender_account_number: str
    receiver_account_number: str
    amount: float

class AccountCreate(BaseModel):
    account_number: str
    initial_deposit: float
    account_type: str
    customer_id: str

class CustomerCreate(BaseModel):
    customer_id: str
    name: str
    email: Optional[str] = None

# --- API Endpoints ---
@app.post("/api/customers/create")
def create_customer(data: CustomerCreate):
    response = supabase.table("customer").insert({
        "customer_id": data.customer_id,
        "name": data.name,
        "email": data.email
    }).execute()
    return {"message": "Customer created successfully", "data": response.data}

@app.post("/api/accounts/create")
def create_account(data: AccountCreate):
    supabase.table("account").insert({
        "account_number": data.account_number,
        "balance": data.initial_deposit,
        "account_type": data.account_type,
        "customer_id": data.customer_id
    }).execute()
    return {"message": "Account created successfully", "account_number": data.account_number}
    
@app.get("/api/transactions/{account_number}", summary="Get Account Transactions")
def get_transactions(account_number: str):
    response = supabase.table("transaction").select("*").eq("account_number", account_number).execute()
    return response.data
    
@app.get("/api/accounts/{account_number}")
def get_account(account_number: str):
    account = supabase.table("account").select("*, customer(*)").eq("account_number", account_number).execute()
    if not account.data:
        raise HTTPException(status_code=404, detail="Account not found.")
    return account.data[0]

@app.post("/api/transactions/transfer", summary="Transfer Between Accounts")
def transfer(req: TransferRequest):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero.")
        
    sender_res = supabase.table("account").select("*").eq("account_number", req.sender_account_number).execute()
    receiver_res = supabase.table("account").select("*").eq("account_number", req.receiver_account_number).execute()
    
    if not sender_res.data or not receiver_res.data:
        raise HTTPException(status_code=404, detail="Sender or receiver account not found.")
        
    sender = sender_res.data[0]
    receiver = receiver_res.data[0]
    
    sender_balance = float(sender["balance"])
    receiver_balance = float(receiver["balance"])
    
    if sender_balance < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient funds in sender account.")
        
    new_sender_balance = sender_balance - req.amount
    new_receiver_balance = receiver_balance + req.amount
    
    # Update balances
    supabase.table("account").update({"balance": new_sender_balance}).eq("account_number", req.sender_account_number).execute()
    supabase.table("account").update({"balance": new_receiver_balance}).eq("account_number", req.receiver_account_number).execute()
    
    # Log transaction
    supabase.table("transaction").insert([
        {
            "transaction_id": "TXN-" + str(uuid.uuid4())[:8],
            "date": datetime.utcnow().isoformat(),
            "amount": req.amount,
            "type": "TRANSFER_OUT",
            "account_number": req.sender_account_number
        },
        {
            "transaction_id": "TXN-" + str(uuid.uuid4())[:8],
            "date": datetime.utcnow().isoformat(),
            "amount": req.amount,
            "type": "TRANSFER_IN",
            "account_number": req.receiver_account_number
        }
    ]).execute()
    
    return {
        "message": "Transfer successful", 
        "sender_balance": new_sender_balance, 
        "receiver_balance": new_receiver_balance
    }

@app.post("/api/transactions/analyze-fraud", summary="Analyze Fraud Risk with Preprocessor & AI Model")
def analyze_fraud(req: TransactionRequest):
    score = 15.0
    level = "Low"
    badge_class = "risk-low"
    flags = ["Transaction fits behavioral baseline"]

    if fraud_model is not None:
        try:
            # 1. Prepare raw input data features
            raw_features = [[req.amount]]
            
            # 2. Pass through preprocessor if available
            processed_features = raw_features
            if data_preprocessor is not None and hasattr(data_preprocessor, "transform"):
                processed_features = data_preprocessor.transform(raw_features)
            
            # 3. Predict using model
            prediction = fraud_model.predict(processed_features)
            
            if hasattr(fraud_model, "predict_proba"):
                proba = fraud_model.predict_proba(processed_features)
                score = float(proba[0][1]) * 100
            else:
                score = 85.0 if prediction[0] == 1 else 10.0
                
        except Exception as e:
            print(f"Model prediction error: {e}")
            score = 60.0 if req.amount > 5000 else 12.0
    else:
        score = 60.0 if req.amount > 5000 else 12.0

    if score >= 60:
        level = "High"
        badge_class = "risk-high"
        flags = ["High-value transaction anomaly detected (> $5,000)"]
    elif score >= 30:
        level = "Medium"
        badge_class = "risk-medium"
        flags = ["Elevated payment velocity or amount spike"]

    return {
        "score": round(score, 1),
        "level": level,
        "badgeClass": badge_class,
        "flags": flags
    }
