// Dashboard JavaScript for MindBloom

let selectedMood = null;
let moodChart = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const token = localStorage.getItem('mindbloom_token');
    const user = JSON.parse(localStorage.getItem('mindbloom_user') || '{}');
    
    if (!token) {
        window.location.href = '/';
        return;
    }

    // Initialize dashboard
    initializeDashboard(user);
    loadDashboardData();
    setupEventListeners();
});

function initializeDashboard(user) {
    // Set user name and initials
    const userName = document.getElementById('userName');
    const userInitials = document.getElementById('userInitials');
    
    if (userName) {
        userName.textContent = user.username || 'Friend';
    }
    
    if (userInitials) {
        const initials = user.username ? user.username.substring(0, 2).toUpperCase() : 'U';
        userInitials.textContent = initials;
    }

    // Show anonymous user notice if applicable
    if (user.isAnonymous) {
        showNotification('You\'re using MindBloom anonymously. Your data is temporary.', 'info');
    }
}

async function loadDashboardData() {
    try {
        showLoading();
        
        // Load recent moods and stats
        await Promise.all([
            loadRecentMoods(),
            loadQuickStats(),
            loadWeeklyChart()
        ]);
        
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        showNotification('Failed to load dashboard data', 'error');
    } finally {
        hideLoading();
    }
}

function setupEventListeners() {
    // Mood button listeners
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            selectMood(this.dataset.mood, this.dataset.emoji);
        });
    });

    // Character count for notes
    const moodNotes = document.getElementById('moodNotes');
    if (moodNotes) {
        moodNotes.addEventListener('input', function() {
            const charCount = document.querySelector('.char-count');
            if (charCount) {
                charCount.textContent = `${this.value.length}/500`;
            }
        });
    }

    // Profile form
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileUpdate);
    }

    // Settings form
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSettingsUpdate);
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.user-menu')) {
            document.getElementById('userDropdown').classList.remove('show');
        }
    });
}

// Mood Logging Functions
function selectMood(moodValue, emoji) {
    selectedMood = { value: parseInt(moodValue), emoji };
    
    // Update UI
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    document.querySelector(`[data-mood="${moodValue}"]`).classList.add('selected');
    
    // Show details form
    document.getElementById('moodDetails').style.display = 'block';
    document.getElementById('moodDetails').scrollIntoView({ behavior: 'smooth' });
}

function cancelMoodLog() {
    selectedMood = null;
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.getElementById('moodDetails').style.display = 'none';
    document.getElementById('moodNotes').value = '';
    document.getElementById('moodTags').value = '';
}

async function saveMoodLog() {
    if (!selectedMood) {
        showNotification('Please select a mood first', 'error');
        return;
    }

    try {
        showLoading();
        
        const notes = document.getElementById('moodNotes').value.trim();
        const tagsInput = document.getElementById('moodTags').value.trim();
        const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

        const moodData = {
            moodValue: selectedMood.value,
            notes: notes || undefined,
            tags: tags.length > 0 ? tags : undefined
        };

        await window.MindBloom.apiCall('/api/mood/log', {
            method: 'POST',
            body: JSON.stringify(moodData)
        });

        showNotification('Mood logged successfully! 🎉', 'success');
        
        // Reset form and reload data
        cancelMoodLog();
        await Promise.all([
            loadRecentMoods(),
            loadQuickStats(),
            loadWeeklyChart()
        ]);

    } catch (error) {
        console.error('Failed to log mood:', error);
        showNotification(error.message || 'Failed to log mood', 'error');
    } finally {
        hideLoading();
    }
}

// Data Loading Functions
async function loadRecentMoods() {
    try {
        const response = await window.MindBloom.apiCall('/api/mood/recent?limit=5');
        const timeline = document.getElementById('moodTimeline');
        
        if (response.moods && response.moods.length > 0) {
            timeline.innerHTML = response.moods.map(mood => `
                <div class="mood-entry">
                    <div class="mood-entry-emoji">${mood.moodEmoji}</div>
                    <div class="mood-entry-content">
                        <div class="mood-entry-time">${formatDate(mood.createdAt)}</div>
                        ${mood.notes ? `<div class="mood-entry-notes">${mood.notes}</div>` : ''}
                        ${mood.tags && mood.tags.length > 0 ? `
                            <div class="mood-entry-tags">
                                ${mood.tags.map(tag => `<span class="mood-tag">${tag}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            timeline.innerHTML = `
                <div class="empty-state">
                    <span class="empty-state-icon">📝</span>
                    <h3>No mood entries yet</h3>
                    <p>Start by logging your first mood above!</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load recent moods:', error);
    }
}

async function loadQuickStats() {
    try {
        const response = await window.MindBloom.apiCall('/api/mood/monthly');
        
        document.getElementById('totalEntries').textContent = response.totalEntries || 0;
        document.getElementById('avgMood').textContent = response.averageMood ? response.averageMood.toFixed(1) : '0';
        
        // Calculate streak (simplified - consecutive days with entries)
        // This is a basic implementation - you might want to enhance this
        document.getElementById('streak').textContent = '0'; // Placeholder
        
    } catch (error) {
        console.error('Failed to load quick stats:', error);
    }
}

async function loadWeeklyChart() {
    try {
        const response = await window.MindBloom.apiCall('/api/mood/weekly');
        renderMoodChart(response.data, 'week');
        
    } catch (error) {
        console.error('Failed to load weekly chart:', error);
    }
}

async function loadMonthlyChart() {
    try {
        const response = await window.MindBloom.apiCall('/api/mood/monthly');
        renderMoodDistribution(response.moodDistribution);
        
    } catch (error) {
        console.error('Failed to load monthly chart:', error);
    }
}

// Chart Rendering Functions
function renderMoodChart(data, period) {
    const ctx = document.getElementById('moodChart').getContext('2d');
    
    if (moodChart) {
        moodChart.destroy();
    }
    
    const labels = data.map(item => {
        const date = new Date(item.date);
        return period === 'week' ? 
            date.toLocaleDateString('en-US', { weekday: 'short' }) :
            date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const moodData = data.map(item => item.averageMood);
    
    moodChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Average Mood',
                data: moodData,
                borderColor: '#8BCF9B',
                backgroundColor: 'rgba(139, 207, 155, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#8BCF9B',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 5,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            const moods = ['', '😢', '😕', '😐', '😊', '😄'];
                            return moods[value] || value;
                        }
                    },
                    grid: {
                        color: '#E2E8F0'
                    }
                },
                x: {
                    grid: {
                        color: '#E2E8F0'
                    }
                }
            },
            elements: {
                point: {
                    hoverRadius: 8
                }
            }
        }
    });
}

function renderMoodDistribution(distribution) {
    const container = document.getElementById('distributionBars');
    const moods = [
        { value: 1, emoji: '😢', label: 'Very Sad' },
        { value: 2, emoji: '😕', label: 'Sad' },
        { value: 3, emoji: '😐', label: 'Neutral' },
        { value: 4, emoji: '😊', label: 'Happy' },
        { value: 5, emoji: '😄', label: 'Very Happy' }
    ];
    
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
    
    container.innerHTML = moods.map(mood => {
        const count = distribution[mood.value] || 0;
        const percentage = total > 0 ? (count / total) * 100 : 0;
        
        return `
            <div class="distribution-item">
                <div class="distribution-emoji">${mood.emoji}</div>
                <div class="distribution-bar">
                    <div class="distribution-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="distribution-count">${count}</div>
            </div>
        `;
    }).join('');
}

// User Menu Functions
function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.classList.toggle('show');
}

function showProfileModal() {
    const user = JSON.parse(localStorage.getItem('mindbloom_user') || '{}');
    
    document.getElementById('profileUsername').value = user.username || '';
    document.getElementById('profileEmail').value = user.email || '';
    
    showModal('profileModal');
}

function showSettingsModal() {
    const user = JSON.parse(localStorage.getItem('mindbloom_user') || '{}');
    
    document.getElementById('notificationsEnabled').checked = user.preferences?.notifications !== false;
    document.getElementById('moodRemindersEnabled').checked = user.preferences?.moodReminders !== false;
    document.getElementById('themeSelect').value = user.preferences?.theme || 'light';
    
    showModal('settingsModal');
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    
    try {
        showLoading();
        
        const formData = new FormData(e.target);
        const profileData = {
            username: formData.get('username'),
            email: formData.get('email') || undefined
        };

        const response = await window.MindBloom.apiCall('/user/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });

        localStorage.setItem('mindbloom_user', JSON.stringify(response.user));
        
        showNotification('Profile updated successfully!', 'success');
        closeModal('profileModal');
        
        // Update UI
        initializeDashboard(response.user);

    } catch (error) {
        console.error('Failed to update profile:', error);
        showNotification(error.message || 'Failed to update profile', 'error');
    } finally {
        hideLoading();
    }
}

async function handleSettingsUpdate(e) {
    e.preventDefault();
    
    try {
        showLoading();
        
        const formData = new FormData(e.target);
        const preferences = {
            notifications: formData.get('notifications') === 'on',
            moodReminders: formData.get('moodReminders') === 'on',
            theme: formData.get('theme')
        };

        const response = await window.MindBloom.apiCall('/user/profile', {
            method: 'PUT',
            body: JSON.stringify({ preferences })
        });

        localStorage.setItem('mindbloom_user', JSON.stringify(response.user));
        
        showNotification('Settings updated successfully!', 'success');
        closeModal('settingsModal');

    } catch (error) {
        console.error('Failed to update settings:', error);
        showNotification(error.message || 'Failed to update settings', 'error');
    } finally {
        hideLoading();
    }
}

function logout() {
    localStorage.removeItem('mindbloom_token');
    localStorage.removeItem('mindbloom_user');
    localStorage.removeItem('mindbloom_session');
    
    showNotification('Logged out successfully', 'success');
    
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        return 'Today at ' + date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    } else if (diffDays === 2) {
        return 'Yesterday at ' + date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    } else if (diffDays <= 7) {
        return date.toLocaleDateString('en-US', { 
            weekday: 'long',
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    } else {
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    }
}

// Import shared functions
const { showModal, closeModal, showNotification, showLoading, hideLoading } = window.MindBloom;