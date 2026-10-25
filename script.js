/**
 * ABC Bank - Real-Life Core Engine
 * Manages Rupee Balances, Admin Account Creation, and AI Risk Telemetry
 */

// Local Storage for Accounts & Ledger
let accounts = JSON.parse(localStorage.getItem('abc_accounts')) || [
    {
        accountNumber: '10011223344',
        pin: '1234',
        name: 'Demo Customer',
        email: 'customer@abcbank.com',
        balance: 25000.00,
        type: 'Savings Account'
    }
];

let transactions = JSON.parse(localStorage.getItem('abc_transactions')) || [
    {
        id: 'TXN-90481',
        account: '10011223344',
        type: 'Debit',
        amount: 2500.00,
        timestamp: '2026-09-28 10:15',
        score: 12,
        level: 'Low',
        badgeClass: 'risk-low'
    }
];

let currentUser = null;

// Validate 11-digit account logic
function isValid11DigitAccount(account) {
    return /^\d{11}$/.test(account);
}

// Toggle inputs for Admin vs Customer
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

// Login Handler
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const role = document.getElementById('loginRole').value;
    const inputAcc = document.getElementById('loginAccount').value.trim();
    const inputPin = document.getElementById('loginPin').value.trim();
    const loginAlert = document.getElementById('loginAlert');

    loginAlert.style.display = 'none';

    // Admin Authentication
    if (role === 'Admin') {
        if (inputAcc === 'AD2026' && inputPin === 'AD2026') {
            authenticateUser({ name: 'System Admin', account: 'AD2026', role: 'Admin' });
        } else {
            loginAlert.innerText = "Invalid Admin Credentials. (Use ID: AD2026, PIN: AD2026)";
            loginAlert.style.display = 'block';
        }
        return;
    }

    // Customer Authentication
    const foundAcc = accounts.find(a => a.accountNumber === inputAcc && a.pin === inputPin);
    if (foundAcc) {
        authenticateUser({ ...foundAcc, role: 'Customer' });
    } else {
        loginAlert.innerText = "Invalid 11-Digit Account Number or Security PIN.";
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
    const adminPanelCard = document.getElementById('adminPanelCard');
    const customerAccountCard = document.getElementById('customerAccountCard');

    if (currentUser.role === 'Admin') {
        transferCard.style.display = 'none'; // Admin cannot issue transactions
        adminPanelCard.style.display = 'block'; // Show Account Creation form
        customerAccountCard.style.display = 'none';
        updateAdminStats();
    } else {
        transferCard.style.display = 'block';
        adminPanelCard.style.display = 'none';
        customerAccountCard.style.display = 'block';
        updateCustomerUI();
    }

    renderLedger();
}

function updateCustomerUI() {
    const acc = accounts.find(a => a.accountNumber === currentUser.accountNumber) || currentUser;
    document.getElementById('displayAccNumber').innerText = acc.accountNumber;
    document.getElementById('displayAccType').innerText = acc.type;
    document.getElementById('displayAccBalance').innerText = `₹${acc.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('abc_user');
    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginForm').reset();
}

// --- ADMIN CREATES ACCOUNT FOR USERS ---
function generate11DigitAccountNumber() {
    let acc = '100';
    for (let i = 0; i < 8; i++) {
        acc += Math.floor(Math.random() * 10);
    }
    return acc;
}

document.getElementById('createAccountForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
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

    const newAccount = {
        accountNumber: newAccNum,
        pin: pin,
        name: name,
        email: email,
        balance: deposit,
        type: type
    };

    accounts.push(newAccount);
    localStorage.setItem('abc_accounts', JSON.stringify(accounts));

    regNotice.innerHTML = `
        <strong>New Customer Account Registered!</strong><br>
        • Account Number: <code>${newAccNum}</code><br>
        • Customer Name: <strong>${name}</strong><br>
        • Initial Deposit: <strong>₹${deposit.toLocaleString('en-IN')}</strong><br>
        <small>Account details saved to central database.</small>
    `;
    regNotice.style.display = 'block';

    updateAdminStats();
    document.getElementById('createAccountForm').reset();
});

function updateAdminStats() {
    document.getElementById('statTotalAccounts').innerText = accounts.length;
    const totalVolume = transactions.reduce((sum, t) => sum + t.amount, 0);
    document.getElementById('statTotalVolume').innerText = `₹${totalVolume.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

// --- AI FRAUD ENGINE ---
function analyzeFraudRisk(account, amount) {
    let score = 0;
    let flags = [];

    if (amount > 500000) {
        score += 50;
        flags.push("High-value transaction anomaly (> ₹5,00,000)");
    } else if (amount > 100000) {
        score += 25;
        flags.push("Elevated transaction amount (> ₹1,00,000)");
    }

    if (account.endsWith("0000") || account.startsWith("99")) {
        score += 30;
        flags.push("Suspicious target account routing profile");
    }

    if (Math.random() < 0.25) {
        score += 20;
        flags.push("Unusual activity time/frequency spike");
    }

    let level = "Low";
    let color = "var(--accent-color)";
    let badgeClass = "risk-low";

    if (score >= 60) {
        level = "High";
        color = "var(--danger-color)";
        badgeClass = "risk-high";
    } else if (score >= 30) {
        level = "Medium";
        color = "var(--warning-color)";
        badgeClass = "risk-medium";
    }

    return { score, level, flags, color, badgeClass };
}

// --- CUSTOMER TRANSFER MANAGEMENT ---
const transferForm = document.getElementById('transferForm');
const transAccountInput = document.getElementById('transAccount');
const transAccError = document.getElementById('transAccError');

transAccountInput.addEventListener('input', () => {
    if (transAccountInput.value.length > 0 && !isValid11DigitAccount(transAccountInput.value)) {
        transAccError.style.display = 'block';
    } else {
        transAccError.style.display = 'none';
    }
});

transferForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const targetAcc = transAccountInput.value.trim();
    const amount = parseFloat(document.getElementById('transAmount').value);
    const type = document.getElementById('transType').value;

    if (!isValid11DigitAccount(targetAcc)) {
        transAccError.style.display = 'block';
        return;
    }

    // Check balance for debit transactions
    const customerAcc = accounts.find(a => a.accountNumber === currentUser.accountNumber);
    if (type === 'Debit' && customerAcc && customerAcc.balance < amount) {
        alert("Insufficient account balance to complete transfer.");
        return;
    }

    // Calculate Fraud Assessment
    const analysis = analyzeFraudRisk(targetAcc, amount);

    const fraudAlert = document.getElementById('fraudAlert');
    const riskMeter = document.getElementById('riskMeter');
    const riskScoreText = document.getElementById('riskScoreText');

    riskMeter.style.width = analysis.score + '%';
    riskMeter.style.backgroundColor = analysis.color;
    riskScoreText.innerText = `Score: ${analysis.score} / 100 (${analysis.level} Risk)`;

    if (analysis.flags.length > 0) {
        fraudAlert.innerHTML = `<strong>Status [${analysis.level} Risk Alert]:</strong><br>` + 
            analysis.flags.map(f => `• ${f}`).join('<br>');
    } else {
        fraudAlert.innerHTML = `<strong>Status [Safe]:</strong> Transaction fits customer's historical behavioral baseline.`;
    }

    // Update Balance
    if (customerAcc) {
        if (type === 'Debit') {
            customerAcc.balance -= amount;
        } else {
            customerAcc.balance += amount;
        }
        localStorage.setItem('abc_accounts', JSON.stringify(accounts));
        updateCustomerUI();
    }

    // Append to Transaction History
    const newTxn = {
        id: 'TXN-' + Math.floor(10000 + Math.random() * 90000),
        account: targetAcc,
        type: type,
        amount: amount,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        score: analysis.score,
        level: analysis.level,
        badgeClass: analysis.badgeClass
    };

    transactions.unshift(newTxn);
    localStorage.setItem('abc_transactions', JSON.stringify(transactions));
    renderLedger();

    transferForm.reset();
});

function renderLedger() {
    const tableBody = document.getElementById('transactionTable');
    tableBody.innerHTML = '';

    transactions.forEach(txn => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${txn.id}</td>
            <td>${txn.account}</td>
            <td>${txn.type}</td>
            <td>₹${txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td>${txn.timestamp}</td>
            <td><span class="risk-badge ${txn.badgeClass}">${txn.level} (${txn.score})</span></td>
        `;
        tableBody.appendChild(row);
    });
}

function clearLedger() {
    if (confirm("Clear local ledger logs?")) {
        transactions = [];
        localStorage.setItem('abc_transactions', JSON.stringify(transactions));
        renderLedger();
    }
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
        To accumulate ₹${target.toLocaleString('en-IN')} over 12 months:<br>
        • Deposit <strong>₹${parseFloat(monthly).toLocaleString('en-IN')}/month</strong> or <strong>₹${parseFloat(weekly).toLocaleString('en-IN')}/week</strong>.<br>
        <em>Automated mandate strategy ready.</em>
    `;
}

// Restore active session
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = sessionStorage.getItem('abc_user');
    if (savedUser) {
        authenticateUser(JSON.parse(savedUser));
    }
});