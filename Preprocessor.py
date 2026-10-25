import pandas as pd
import numpy as np

print("Loading dataset...")
columns_to_keep = ['TransactionID', 'isFraud', 'TransactionAmt', 'TransactionDT', 'card1', 'card2']
df = pd.read_csv('Data/train_transaction.csv', usecols=columns_to_keep)

print("Injecting project features (Sender, Receiver, Amount, Time, Type)...")
np.random.seed(42)

# 1. Simulate Sender and Receiver Accounts
df['sender_account'] = df['card1'] # Using card1 as a proxy for sender account ID
df['receiver_account'] = df['card2'] + 12345 # Proxy for receiver account ID

# 2. Transaction Type (Account Transfer vs Cash Out)
df['transaction_type'] = np.random.choice(['account_transfer', 'cash_out'], size=len(df), p=[0.7, 0.3])

# 3. Time: Convert TransactionDT (seconds) into Hour of the Day (0 to 23)
# IEEE TransactionDT starts at some arbitrary time, so we mod by 86400 (seconds in a day) and get the hour
df['hour_of_day'] = (df['TransactionDT'] // 3600) % 24

# 4. Account Type & Verification
df['account_type'] = np.random.choice(['common', 'business'], size=len(df), p=[0.8, 0.2])
df['is_verified_business'] = False
business_mask = df['account_type'] == 'business'
df.loc[business_mask, 'is_verified_business'] = np.random.choice([True, False], size=business_mask.sum(), p=[0.85, 0.15])

# Keep only what we need
clean_df = df[['sender_account', 'receiver_account', 'TransactionAmt', 'hour_of_day', 'transaction_type', 'account_type', 'is_verified_business', 'isFraud']]
clean_df.to_csv('cleaned_banking_data.csv', index=False)
print("Preprocessing complete! Saved to 'cleaned_banking_data.csv'")
