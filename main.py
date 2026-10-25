import pickle
import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime
from connector import supabase  # Connects to Supabase
import numpy as np
from datetime import datetime

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
    supabase.table("account").update({"balance": new_sender_balance}).eq("account_number",
                                                                         req.sender_account_number).execute()
    supabase.table("account").update({"balance": new_receiver_balance}).eq("account_number",
                                                                           req.receiver_account_number).execute()

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


@app.post("/api/transactions/analyze-fraud", summary="Analyze Fraud Risk with AI Model")
def analyze_fraud(req: TransactionRequest):
    score = 15.0
    level = "Low"
    badge_class = "risk-low"
    flags = ["Transaction fits behavioral baseline"]

    if fraud_model is not None:
        try:
            # 1. Fetch account & customer details from Supabase DBMS
            # to check if they are a 'business' account and if they are verified!
            account_data = supabase.table("account").select("*, customer(*)").eq("account_number",
                                                                                 req.account_number).execute()

            account_type = "common"
            is_verified = False

            if account_data.data:
                acc_info = account_data.data[0]
                account_type = acc_info.get("account_type", "common")
                is_verified = acc_info.get("is_verified", False)

            # 2. Map features to match what your model expects (8 features)
            account_type_num = 1 if account_type.lower() == "business" else 0
            is_verified_num = 1 if is_verified else 0

            try:
                sender_acc_int = int(req.account_number)
                receiver_acc_int = int(req.target_account) if req.target_account else 0
            except ValueError:
                sender_acc_int = 12345
                receiver_acc_int = 67890

            current_hour = datetime.now().hour
            tx_type_num = 0 if req.target_account else 1  # 0 = transfer, 1 = cash out

            # Engineered feature matching your training script
            amt_to_card_mean = req.amount / (sender_acc_int + 1.0)

            # 3. Build the exact feature array (8 columns)
            features = np.array([[
                req.amount,
                account_type_num,
                is_verified_num,
                sender_acc_int,
                receiver_acc_int,
                current_hour,
                tx_type_num,
                amt_to_card_mean
            ]])

            # 4. Predict probability using your model
            if hasattr(fraud_model, "predict_proba"):
                proba = fraud_model.predict_proba(features)
                fraud_prob = float(proba[0][1])
                score = fraud_prob * 100
            else:
                prediction = fraud_model.predict(features)
                score = 85.0 if prediction[0] == 1 else 10.0

            # 5. Apply Business Exemption Rule
            is_fraud = score >= 40.0  # matches your 0.40 threshold
            if account_type.lower() == "business" and is_verified:
                if score < 80.0:  # Exemption buffer for verified businesses
                    is_fraud = False
                    score = min(score, 25.0)  # Lower score for UI if exempted

            if is_fraud:
                level = "High"
                badge_class = "risk-high"
                flags = ["AI Model flagged transaction as suspicious anomaly."]
            elif score >= 30:
                level = "Medium"
                badge_class = "risk-medium"
                flags = ["Elevated payment risk threshold warning."]
            else:
                level = "Low"
                badge_class = "risk-low"
                flags = ["Transaction passed AI security check."]

            if account_type.lower() == "business" and is_verified and score < 80:
                flags.append("Verified Business Account exemption applied.")

        except Exception as e:
            print(f"Model prediction error: {e}")
            score = 60.0 if req.amount > 5000 else 12.0
    else:
        score = 60.0 if req.amount > 5000 else 12.0

    return {
        "score": round(score, 1),
        "level": level,
        "badgeClass": badge_class,
        "flags": flags
    }