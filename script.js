/**
 * ABC Bank - Integrated Front-End Logic
 * Connects GitHub Pages Frontend to FastAPI & Supabase Backend on Render
 */

const API_BASE_URL = 'https://abc-bank-1.onrender.com/api'; 
let currentUser = null;

// --- AUTHENTICATION TABS & UTILS ---
function switchAuthTab(mode) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    
    document.getElementById('loginAlert').style.display = 'none';
    document.getElementById('regAlert').style.display = 'none';

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
        loginAccount.placeholder = "e.g., 1002994946";
    }
}

function generate11DigitAccountNumber() {
    let acc = '100';
    for (let i = 0; i < 8; i++) {
        acc += Math.floor(Math.random() * 10);
    }
    return acc;
}

// --- REGISTRATION HANDLER ---
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
        const custRes = await fetch(`${API_BASE_URL}/customers/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: customerId, name: name, email: email })
        });

        if (!custRes.ok) throw new Error("Failed to register customer profile.");

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
            <small>Use this Account Number to sign in.</small>
        `;
        regSuccessNotice.style.display = 'block';
        document.getElementById('registerForm').reset();

    } catch (err) {
        regAlert.innerText = err.message || "Server connection error.";
        regAlert.style.display = 'block';
    }
});

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
            loginAlert.innerText = "Invalid Admin Credentials.";
            loginAlert.style.display = 'block';
        }
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/accounts/${inputAcc}`);
        if (!res.ok) throw new Error("Account not found.");
        
        const accountData = await res.json();
        
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
    if (currentUser.role === 'Admin') {
        transferCard.style.display = 'none';
    } else {
        transferCard.style.display = 'block';
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

// --- FUND TRANSFER HANDLER ---
const transferForm = document.getElementById('transferForm');
const transAccountInput = document.getElementById('transAccount');
const transAccError = document.getElementById('transAccError');

function isValid11DigitAccount(account) {
    return /^\d{11}$/.test(account);
}

transAccountInput.addEventListener('input', () => {
    if (transAccountInput.value.length > 0 && !isValid11DigitAccount(transAccountInput.value)) {
        transAccError.style.display = 'block';
    } else {
        transAccError.style.display = 'none';
    }
});

transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const targetAcc = transAccountInput.value.trim();
    const amount = parseFloat(document.getElementById('transAmount').value);

    if (!isValid11DigitAccount(targetAcc)) {
        transAccError.style.display = 'block';
        return;
    }

    if (targetAcc === currentUser.account) {
        alert("Error: You cannot transfer funds to your own account.");
        return;
    }

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
            throw new Error(errData.detail || "Transaction failed.");
        }

        const data = await res.json();
        alert(`Success! Transfer completed. New Balance: $${data.sender_balance.toFixed(2)}`);
        transferForm.reset();
        renderLedger(); // Refresh transaction history table

    } catch (err) {
        alert("Error: " + err.message);
    }
});

// --- RENDER TRANSACTION LEDGER ---
async function renderLedger() {
    if (!currentUser || currentUser.role === 'Admin') return;

    const tableBody = document.getElementById('transactionTable');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1rem;">Loading ledger history...</td></tr>';

    try {
        const res = await fetch(`${API_BASE_URL}/transactions/${currentUser.account}`);
        if (!res.ok) throw new Error("Could not load transaction history.");

        const transactions = await res.json();
        tableBody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1rem;">No transactions recorded yet.</td></tr>';
            return;
        }

        transactions.forEach(txn => {
            const row = document.createElement('tr');
            const formattedDate = txn.date ? txn.date.replace('T', ' ').substring(0, 16) : 'N/A';
            const amountVal = parseFloat(txn.amount || 0).toFixed(2);
            
            row.innerHTML = `
                <td><code>${txn.transaction_id || 'TXN-0000'}</code></td>
                <td>${txn.account_number}</td>
                <td><span class="badge">${txn.type}</span></td>
                <td>$${amountVal}</td>
                <td><small>${formattedDate}</small></td>
                <td><span class="risk-badge risk-low">Low (12)</span></td>
            `;
            tableBody.appendChild(row);
        });

    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red; padding: 1rem;">Error loading ledger.</td></tr>`;
    }
}

// Restore Session on Load
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = sessionStorage.getItem('abc_user');
    if (savedUser) {
        authenticateUser(JSON.parse(savedUser));
    }
});
