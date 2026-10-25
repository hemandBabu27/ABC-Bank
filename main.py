import pickle
import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime
from connector import supabase  # Connects to Supabase

app = FastAPI(title="ABC Bank Smart AI Core API")

# Enable CORS so your index.html / script.js can communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Load ML Fraud Detection Model & Preprocessor ---
try:
    with open("fraud_model.pkl", "rb") as f:
        fraud_model = pickle.load(f)
except Exception as e:
    fraud_model = None

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
    
    # 1. Update balances in Supabase
    supabase.table("account").update({"balance": new_sender_balance}).eq("account_number", req.sender_account_number).execute()
    supabase.table("account").update({"balance": new_receiver_balance}).eq("account_number", req.receiver_account_number).execute()
    
    # 2. Insert transaction logs into the Supabase transaction table
    tx_id_sender = "TXN-" + str(uuid.uuid4())[:8]
    tx_id_receiver = "TXN-" + str(uuid.uuid4())[:8]
    
    supabase.table("transaction").insert([
        {
            "transaction_id": tx_id_sender,
            "date": datetime.utcnow().isoformat(),
            "amount": req.amount,
            "type": "TRANSFER_OUT",
            "account_number": req.sender_account_number
        },
        {
            "transaction_id": tx_id_receiver,
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
    
@app.get("/api/transactions/{account_number}", summary="Get Account Transactions")
def get_transactions(account_number: str):
    response = supabase.table("transaction").select("*").eq("account_number", account_number).execute()
    return response.data
    
@app.post("/api/transactions/analyze-fraud")
def analyze_fraud(req: TransactionRequest):
    risk_score = 12
    risk_level = "Low"
    
    if req.amount > 5000:
        risk_score = 65
        risk_level = "High"

    return {
        "score": risk_score,
        "level": risk_level,
        "flags": ["High-value transfer check passed"] if risk_score < 50 else ["Elevated transaction threshold warning"]
    }
