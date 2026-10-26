/**
 * ABC Bank - Live Backend & Supabase Integrated Script
 */

const API_BASE_URL = 'https://abc-bank-1.onrender.com/api'; 
let currentUser = null;

function isValid11DigitAccount(account) {
    return /^\d{11}$/.test(account);
}

function toggleRoleFields() {
    const role = document.getElementById('loginRole').value;
    const accountLabel = document.getElementById('accountLabel');
    const loginAccount = document.getElementById('loginAccount');

    if (role === 'Admin') {
        accountLabel.innerText = "Admin Username";
        loginAccount.value = "AD2026";
        loginAccount.readOnly = true;
    } else {
        accountLabel.innerText = "11-Digit Account Number";
        loginAccount.value = "";
        loginAccount.readOnly = false;
        loginAccount.placeholder = "e.g., 10023456789";
    }
}

// --- LOGIN HANDLER ---
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const role = document.getElementById('loginRole').value;
    const inputAcc = document.getElementById('loginAccount').value.trim();
    const inputPin = document.getElementById('loginPin').value.trim();
    const loginAlert = document.getElementById('loginAlert');

    loginAlert.style.display = 'none';

    if (role === 'Admin') {
        if (inputAcc === 'AD2026' && inputPin === 'AD2026') {
            authenticateUser({ name: 'System Admin', account: 'AD2026', role: 'Admin' });
        } else {
            loginAlert.innerText = "Invalid Admin Credentials (Use ID: AD2026, PIN: AD2026)";
            loginAlert.style.display = 'block';
        }
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/accounts/${inputAcc}`);
        if (!res.ok) throw new Error("Account not found in database.");
        
        const accountData = await res.json();
        
        authenticateUser({ 
            name: accountData.customer ? accountData.customer.name : 'Valued Customer', 
            account: accountData.account_number, 
            balance: accountData.balance,
            account_type: accountData.account_type,
            category: accountData.category || 'Common',
            role: 'Customer' 
        });

    } catch (err) {
        loginAlert.innerText = "Invalid 11-Digit Account Number or server offline.";
        loginAlert.style.display = 'block';
    }
});

function authenticateUser(userObj) {
    currentUser = userObj;
    sessionStorage.setItem('abc_user', JSON.stringify(currentUser));
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';

    document.getElementById('userDisplayName').innerText = currentUser.name;
    document.getElementById('userRoleBadge').innerText = currentUser.role;

    const transferCard = document.getElementById('transferCard');
    const atmCard = document.getElementById('atmCard');
    const adminPanelCard = document.getElementById('adminPanelCard');
    const customerAccountCard = document.getElementById('customerAccountCard');

    if (currentUser.role === 'Admin') {
        transferCard.style.display = 'none';
        atmCard.style.display = 'none';
        adminPanelCard.style.display = 'block';
        customerAccountCard.style.display = 'none';
    } else {
        transferCard.style.display = 'block';
        atmCard.style.display = 'block';
        adminPanelCard.style.display = 'none';
        customerAccountCard.style.display = 'block';

        document.getElementById('displayAccNumber').innerText = currentUser.account;
        document.getElementById('displayCategory').innerText = currentUser.category || 'Common';
        document.getElementById('displayAccType').innerText = currentUser.account_type || 'Savings Account';
        document.getElementById('displayAccBalance').innerText = `₹${parseFloat(currentUser.balance || 0).toFixed(2)}`;

        renderLedger();
    }
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('abc_user');
    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginForm').reset();
}

// --- ADMIN CREATES ACCOUNT (SAVES DIRECTLY TO SUPABASE) ---
function generate11DigitAccountNumber() {
    let acc = '100';
    for (let i = 0; i < 8; i++) {
        acc += Math.floor(Math.random() * 10);
    }
    return acc;
}

const createAccountForm = document.getElementById('createAccountForm');
if (createAccountForm) {
    createAccountForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const category = document.getElementById('regCategory').value;
        const email = document.getElementById('regEmail').value.trim();
        const type = document.getElementById('regType').value;
        const deposit = parseFloat(document.getElementById('regDeposit').value);
        const pin = document.getElementById('regPin').value.trim();
        const regNotice = document.getElementById('regSuccessNotice');

        if (pin.length !== 4 || isNaN(pin)) {
            alert("PIN must be a 4-digit number.");
            return;
        }

        const newAccNum = generate11DigitAccountNumber();
        const customerId = 'CUST-' + Math.floor(1000 + Math.random() * 9000);

        try {
            // 1. Insert customer into Supabase via FastAPI
            const custRes = await fetch(`${API_BASE_URL}/customers/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_id: customerId, name: name, email: email })
            });
            if (!custRes.ok) throw new Error("Failed to create customer profile.");

            // 2. Insert account into Supabase via FastAPI
            const accRes = await fetch(`${API_BASE_URL}/accounts/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    account_number: newAccNum,
                    initial_deposit: deposit,
                    account_type: type,
                    category: category,
                    customer_id: customerId,
                    is_verified: category === 'Business'
                })
            });
            if (!accRes.ok) throw new Error("Failed to initialize bank account.");

            regNotice.innerHTML = `
                <strong>New ${category} Account Registered in Supabase!</strong><br>
                • Account Number: <code>${newAccNum}</code><br>
                • Entity/Customer: <strong>${name}</strong><br>
                • Opening Balance: <strong>₹${deposit.toLocaleString('en-IN')}</strong>
            `;
            regNotice.style.display = 'block';
            createAccountForm.reset();

        } catch (err) {
            alert("Database Error: " + err.message);
        }
    });
}

// --- AI FRAUD SCORING ENGINE ---
async function analyzeFraudRisk(amount, targetAccount) {
    try {
        const res = await fetch(`${API_BASE_URL}/transactions/analyze-fraud`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                account_number: currentUser.account,
                amount: amount,
                target_account: targetAccount
            })
        });

        if (res.ok) {
            const data = await res.json();
            const riskMeter = document.getElementById('riskMeter');
            const riskScoreText = document.getElementById('riskScoreText');
            const fraudAlert = document.getElementById('fraudAlert');

            riskMeter.style.width = `${data.score}%`;
            riskMeter.style.backgroundColor = data.score > 60 ? '#dc2626' : (data.score > 30 ? '#d97706' : '#16a34a');
            riskScoreText.innerText = `Score: ${data.score} / 100 (${data.level} Risk)`;
            fraudAlert.innerHTML = `<strong>AI Flag:</strong> ${data.flags.join(' | ')}`;
        }
    } catch (e) {
        console.error("AI Fraud analysis error:", e);
    }
}

// --- ATM & FUND TRANSFERS ---
const transferForm = document.getElementById('transferForm');
if (transferForm) {
    transferForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetAcc = document.getElementById('transAccount').value.trim();
        const amount = parseFloat(document.getElementById('transAmount').value);
        const type = document.getElementById('transType').value;

        if (targetAcc.length !== 11) {
            alert("Beneficiary account must be exactly 11 digits.");
            return;
        }

        if (targetAcc === currentUser.account) {
            alert("You cannot transfer funds to your own account.");
            return;
        }

        await analyzeFraudRisk(amount, targetAcc);

        try {
            const res = await fetch(`${API_BASE_URL}/transactions/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender_account_number: currentUser.account,
                    receiver_account_number: targetAcc,
                    amount: amount
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Transfer failed.");
            }

            const data = await res.json();
            currentUser.balance = data.sender_balance;
            document.getElementById('displayAccBalance').innerText = `₹${parseFloat(data.sender_balance).toFixed(2)}`;
            
            alert(`Transfer Successful! New Balance: ₹${data.sender_balance.toFixed(2)}`);
            transferForm.reset();
            renderLedger();

        } catch (err) {
            alert("Transaction Error: " + err.message);
        }
    });
}

// --- RENDER TRANSACTION LEDGER FROM SUPABASE ---
async function renderLedger() {
    if (!currentUser || currentUser.role === 'Admin') return;

    const tableBody = document.getElementById('transactionTable');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading ledger history...</td></tr>';

    try {
        const res = await fetch(`${API_BASE_URL}/transactions/${currentUser.account}`);
        if (!res.ok) throw new Error("Could not load transaction history.");

        const transactions = await res.json();
        tableBody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No transactions recorded yet.</td></tr>';
            return;
        }

        transactions.forEach(txn => {
            const row = document.createElement('tr');
            const formattedDate = txn.date ? txn.date.replace('T', ' ').substring(0, 16) : 'N/A';
            
            row.innerHTML = `
                <td><code>${txn.transaction_id || 'TXN-0000'}</code></td>
                <td>${txn.account_number}</td>
                <td><span class="badge">${txn.type}</span></td>
                <td>₹${parseFloat(txn.amount || 0).toFixed(2)}</td>
                <td><small>${formattedDate}</small></td>
                <td><span class="risk-badge risk-low">Low (12)</span></td>
            `;
            tableBody.appendChild(row);
        });

    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">Error loading history.</td></tr>`;
    }
}

function clearLedger() {
    document.getElementById('transactionTable').innerHTML = '<tr><td colspan="6" style="text-align: center;">Ledger session view cleared.</td></tr>';
}

// --- FINANCIAL GOAL PLANNER ---
function calculateGoal() {
    const name = document.getElementById('goalName').value || 'Emergency Reserve';
    const target = parseFloat(document.getElementById('goalTarget').value);
    const resultBox = document.getElementById('goalResult');

    if (!target || target <= 0) {
        alert('Please enter a valid target amount.');
        return;
    }

    const monthly = (target / 12).toFixed(2);
    const weekly = (target / 52).toFixed(2);

    resultBox.style.display = 'block';
    resultBox.innerHTML = `
        <strong>AI Deposit Strategy for "${name}":</strong><br>
        • Monthly: <strong>₹${parseFloat(monthly).toLocaleString('en-IN')}</strong><br>
        • Weekly: <strong>₹${parseFloat(weekly).toLocaleString('en-IN')}</strong>
    `;
}

// Restore session on load
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = sessionStorage.getItem('abc_user');
    if (savedUser) {
        authenticateUser(JSON.parse(savedUser));
    }
});
