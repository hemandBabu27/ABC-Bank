/**
 * ABC Bank - Integrated Front-End Logic
 * Connects Frontend UI to FastAPI & Supabase Backend
 */

const API_BASE_URL = 'http://127.0.0.1:8000/api';
let currentUser = null;

// --- 1. AUTHENTICATION & REGISTRATION TABS ---
function switchAuthTab(mode) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginAlert = document.getElementById('loginAlert');
    const regAlert = document.getElementById('regAlert');

    loginAlert.style.display = 'none';
    regAlert.style.display = 'none';

    if (mode === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        tabLogin.classList.remove('active');
        tabRegister.classList.add('active');
    }
}

function toggleRoleFields() {
    const role = document.getElementById('loginRole').value;
    const accountLabel = document.getElementById('accountLabel');
    const loginAccount = document.getElementById('loginAccount');

    if (role === 'Admin') {
        accountLabel.innerText = "Admin Username";
        loginAccount.placeholder = "e.g., AD2026";
    } else {
        accountLabel.innerText = "11-Digit Account Number";
        loginAccount.placeholder = "e.g., 10023456789";
    }
}

function generate11DigitAccountNumber() {
    let acc = '100';
    for (let i = 0; i < 8; i++) {
        acc += Math.floor(Math.random() * 10);
    }
    return acc;
}

// --- Registration Handler (Calls FastAPI /api/accounts/create) ---
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const type = document.getElementById('regType').value;
    const deposit = parseFloat(document.getElementById('regDeposit').value);
    const pin = document.getElementById('regPin').value.trim();

    const regAlert = document.getElementById('regAlert');
    const regSuccessNotice = document.getElementById('regSuccessNotice');
    regAlert.style.display = 'none';

    if (pin.length !== 4 || isNaN(pin)) {
        regAlert.innerText = "PIN must be exactly 4 digits.";
        regAlert.style.display = 'block';
        return;
    }

    if (deposit < 50) {
        regAlert.innerText = "Minimum initial deposit is $50.";
        regAlert.style.display = 'block';
        return;
    }

    const newAccNum = generate11DigitAccountNumber();
    const customerId = 'CUST-' + Math.floor(1000 + Math.random() * 9000);

    try {
        // 1. Create Customer in Supabase via FastAPI
        const custRes = await fetch(`${API_BASE_URL}/customers/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: customerId, name: name, email: email })
        });

        if (!custRes.ok) throw new Error("Failed to register customer profile.");

        // 2. Create Account linked to Customer
        const accRes = await fetch(`${API_BASE_URL}/accounts/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                account_number: newAccNum,
                initial_deposit: deposit,
                account_type: type,
                customer_id: customerId
            })
        });

        if (!accRes.ok) throw new Error("Failed to initialize bank account.");

        regSuccessNotice.innerHTML = `
            <strong>Account Created Successfully!</strong><br>
            Your 11-Digit Account Number is: <code>${newAccNum}</code><br>
            <small>Use this Account Number to log in.</small>
        `;
        regSuccessNotice.style.display = 'block';
        document.getElementById('registerForm').reset();

    } catch (err) {
        regAlert.innerText = err.message || "Server connection error.";
        regAlert.style.display = 'block';
    }
});

// --- Login Handler (Verifies against FastAPI /api/accounts/{account_number}) ---
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
            loginAlert.innerText = "Invalid Admin Credentials.";
            loginAlert.style.display = 'block';
        }
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/accounts/${inputAcc}`);
        if (!res.ok) throw new Error("Account not found.");
        
        const accountData = await res.json();
        
        // Authenticate Customer
        authenticateUser({ 
            name: accountData.customer.name, 
            account: accountData.account_number, 
            balance: accountData.balance,
            role: 'Customer' 
        });

    } catch (err) {
        loginAlert.innerText = "Invalid 11-Digit Account Number or server error.";
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
    const adminOverviewCard = document.getElementById('adminOverviewCard');

    if (currentUser.role === 'Admin') {
        transferCard.style.display = 'none';
        adminOverviewCard.style.display = 'block';
    } else {
        transferCard.style.display = 'block';
        adminOverviewCard.style.display = 'none';
    }
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('abc_user');
    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginForm').reset();
}

// --- 2. TRANSACTION & TRANSFER HANDLING ---
const transferForm = document.getElementById('transferForm');

transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const targetAcc = document.getElementById('transAccount').value.trim();
    const amount = parseFloat(document.getElementById('transAmount').value);
    const type = document.getElementById('transType').value;

    const endpoint = type === 'Credit' ? '/transactions/deposit' : '/transactions/transfer';
    
    let payload = { account_number: targetAcc, amount: amount };
    if (type === 'Debit' || type === 'Transfer') {
        payload = {
            sender_account_number: currentUser.account,
            receiver_account_number: targetAcc,
            amount: amount
        };
    }

    try {
        const res = await fetch(`${API_BASE_URL}${type === 'Credit' ? '/transactions/deposit' : '/transactions/transfer'}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(type === 'Credit' ? { account_number: currentUser.account, amount } : {
                sender_account_number: currentUser.account,
                receiver_account_number: targetAcc,
                amount: amount
            })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Transaction failed.");
        }

        alert("Transaction completed successfully via Supabase backend!");
        transferForm.reset();

    } catch (err) {
        alert("Error: " + err.message);
    }
});

window.addEventListener('DOMContentLoaded', () => {
    const savedUser = sessionStorage.getItem('abc_user');
    if (savedUser) {
        authenticateUser(JSON.parse(savedUser));
    }
});