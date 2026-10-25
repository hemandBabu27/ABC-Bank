from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import numpy as np

app = FastAPI(title="Banking App Fraud Detection AI Microservice")

# Load your trained AI brain
model = joblib.load('fraud_model.pkl')

class TransactionPayload(BaseModel):
    sender_account: int
    receiver_account: int
    transaction_amt: float
    hour_of_day: int          # 0 to 23
    transaction_type: str     # "account_transfer" or "cash_out"
    account_type: str         # "common" or "business"
    is_verified_business: bool

@app.post("/predict")
def predict_fraud(data: TransactionPayload):
    # Convert text fields to numbers
    account_type_num = 1 if data.account_type.lower() == "business" else 0
    is_verified_num = 1 if data.is_verified_business else 0
    tx_type_num = 1 if data.transaction_type.lower() == "cash_out" else 0

    # Build features array
    features = np.array([[
        data.sender_account,
        data.receiver_account,
        data.transaction_amt,
        data.hour_of_day,
        tx_type_num,
        account_type_num,
        is_verified_num
    ]])

    # Get fraud probability from the AI model
    fraud_probability = float(model.predict_proba(features)[0][1])

    # Threshold decision
    is_fraud = fraud_probability > 0.40

    # Business account exemption rule
    if data.account_type.lower() == "business" and data.is_verified_business:
        if fraud_probability < 0.80:
            is_fraud = False

    return {
        "sender_account": data.sender_account,
        "receiver_account": data.receiver_account,
        "fraud_score": round(fraud_probability, 4),
        "is_fraud": is_fraud,
        "action": "BLOCK" if is_fraud else "APPROVE"
    }