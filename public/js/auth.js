// Authentication Page JavaScript

// Check if user is already authenticated
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('mindbloom_token');
    const currentPage = window.location.pathname;
    
    // If user is already logged in and on login/register page, redirect to dashboard
    if (token && (currentPage.includes('login.html') || currentPage.includes('register.html'))) {
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Initialize page-specific functionality
    if (currentPage.includes('login.html')) {
        initializeLoginPage();
    } else if (currentPage.includes('register.html')) {
        initializeRegisterPage();
    }
});

// Login Page Initialization
function initializeLoginPage() {
    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Focus on username field
    const usernameField = document.getElementById('username');
    if (usernameField) {
        usernameField.focus();
    }
}

// Register Page Initialization
function initializeRegisterPage() {
    const registerForm = document.getElementById('registerForm');
    
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    // Real-time password confirmation validation
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirmPassword');
    
    if (password && confirmPassword) {
        confirmPassword.addEventListener('input', validatePasswordMatch);
    }
    
    // Focus on username field
    const usernameField = document.getElementById('username');
    if (usernameField) {
        usernameField.focus();
    }
}

// Handle Login Form Submission
async function handleLogin(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const loginButton = document.getElementById('loginButton');
    
    // Clear previous errors
    clearFormErrors();
    
    // Validate form
    if (!validateLoginForm(formData)) {
        return;
    }
    
    const credentials = {
        username: formData.get('username').trim(),
        password: formData.get('password')
    };
    
    try {
        setButtonLoading(loginButton, true);
        
        const response = await window.MindBloom.apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
        
        // Store authentication data
        localStorage.setItem('mindbloom_token', response.token);
        localStorage.setItem('mindbloom_user', JSON.stringify(response.user));
        
        showNotification('Login successful! Redirecting...', 'success');
        
        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
        
    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message || 'Login failed. Please try again.', 'error');
        
        // Show specific field errors if available
        if (error.message.includes('Invalid credentials')) {
            showFieldError('password', 'Invalid username or password');
        }
    } finally {
        setButtonLoading(loginButton, false);
    }
}

// Handle Register Form Submission
async function handleRegister(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const registerButton = document.getElementById('registerButton');
    
    // Clear previous errors
    clearFormErrors();
    
    // Validate form
    if (!validateRegisterForm(formData)) {
        return;
    }
    
    const userData = {
        username: formData.get('username').trim(),
        email: formData.get('email').trim() || undefined,
        password: formData.get('password')
    };
    
    try {
        setButtonLoading(registerButton, true);
        
        const response = await window.MindBloom.apiCall('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        
        // Store authentication data
        localStorage.setItem('mindbloom_token', response.token);
        localStorage.setItem('mindbloom_user', JSON.stringify(response.user));
        
        showNotification('Account created successfully! Redirecting...', 'success');
        
        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
        
    } catch (error) {
        console.error('Registration error:', error);
        showNotification(error.message || 'Registration failed. Please try again.', 'error');
        
        // Show specific field errors if available
        if (error.message.includes('already exists')) {
            showFieldError('username', 'Username already taken');
        }
    } finally {
        setButtonLoading(registerButton, false);
    }
}

// Continue Anonymously
async function continueAnonymously() {
    try {
        showLoading();
        
        const response = await window.MindBloom.apiCall('/auth/anonymous', {
            method: 'POST'
        });
        
        // Store authentication data
        localStorage.setItem('mindbloom_token', response.token);
        localStorage.setItem('mindbloom_user', JSON.stringify(response.user));
        localStorage.setItem('mindbloom_session', response.sessionId);
        
        showNotification('Anonymous session started! Redirecting...', 'success');
        
        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
        
    } catch (error) {
        console.error('Anonymous login error:', error);
        showNotification(error.message || 'Failed to start anonymous session', 'error');
    } finally {
        hideLoading();
    }
}

// Form Validation Functions
function validateLoginForm(formData) {
    let isValid = true;
    
    const username = formData.get('username').trim();
    const password = formData.get('password');
    
    if (!username) {
        showFieldError('username', 'Username is required');
        isValid = false;
    }
    
    if (!password) {
        showFieldError('password', 'Password is required');
        isValid = false;
    }
    
    return isValid;
}

function validateRegisterForm(formData) {
    let isValid = true;
    
    const username = formData.get('username').trim();
    const email = formData.get('email').trim();
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    
    // Username validation
    if (!username) {
        showFieldError('username', 'Username is required');
        isValid = false;
    } else if (username.length < 3 || username.length > 30) {
        showFieldError('username', 'Username must be between 3 and 30 characters');
        isValid = false;
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showFieldError('username', 'Username can only contain letters, numbers, and underscores');
        isValid = false;
    }
    
    // Email validation (optional)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError('email', 'Please enter a valid email address');
        isValid = false;
    }
    
    // Password validation
    if (!password) {
        showFieldError('password', 'Password is required');
        isValid = false;
    } else if (password.length < 8) {
        showFieldError('password', 'Password must be at least 8 characters long');
        isValid = false;
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        showFieldError('password', 'Password must contain at least one lowercase letter, one uppercase letter, and one number');
        isValid = false;
    }
    
    // Confirm password validation
    if (!confirmPassword) {
        showFieldError('confirmPassword', 'Please confirm your password');
        isValid = false;
    } else if (password !== confirmPassword) {
        showFieldError('confirmPassword', 'Passwords do not match');
        isValid = false;
    }
    
    return isValid;
}

function validatePasswordMatch() {
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (confirmPassword && password !== confirmPassword) {
        showFieldError('confirmPassword', 'Passwords do not match');
    } else {
        clearFieldError('confirmPassword');
    }
}

// UI Helper Functions
function showFieldError(fieldName, message) {
    const errorElement = document.getElementById(fieldName + 'Error');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }
    
    const field = document.getElementById(fieldName);
    if (field) {
        field.style.borderColor = '#F56565';
    }
}

function clearFieldError(fieldName) {
    const errorElement = document.getElementById(fieldName + 'Error');
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.classList.remove('show');
    }
    
    const field = document.getElementById(fieldName);
    if (field) {
        field.style.borderColor = '';
    }
}

function clearFormErrors() {
    const errorElements = document.querySelectorAll('.form-error');
    errorElements.forEach(element => {
        element.textContent = '';
        element.classList.remove('show');
    });
    
    const fields = document.querySelectorAll('input');
    fields.forEach(field => {
        field.style.borderColor = '';
    });
}

function setButtonLoading(button, loading) {
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
        const spinner = button.querySelector('.btn-spinner');
        if (spinner) {
            spinner.style.display = 'block';
        }
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        const spinner = button.querySelector('.btn-spinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }
}

// Password Toggle Function
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling.querySelector('.password-icon');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = '🙈';
    } else {
        input.type = 'password';
        icon.textContent = '👁️';
    }
}

// Import shared functions from main.js
const { showNotification, showLoading, hideLoading } = window.MindBloom;