document.addEventListener('DOMContentLoaded', () => {
  // Constants
  const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const DEFAULT_MODEL = 'gemini-1.5-flash';

  // Element Selectors
  const messagesPanel = document.getElementById('chat-window');
  const chatForm = document.getElementById('chat-form');
  const messageInput = document.getElementById('message-input');
  const sendButton = chatForm.querySelector('button');
  const settingsButton = document.getElementById('settings-button');
  const themeSwitcher = document.getElementById('theme-switcher');
  const languageSelector = document.getElementById('language-selector');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsButton = document.getElementById('close-settings-button');
  const cancelSettingsButton = document.getElementById('cancel-settings-button');
  const saveSettingsButton = document.getElementById('save-settings-button');
  const modelNameInput = document.getElementById('model-name-input');
  const apiKeyInput = document.getElementById('api-key-input');
  const toastContainer = document.getElementById('toast-container');

  // State Variables
  let currentModel = DEFAULT_MODEL;
  let apiKey = '';
  let isProcessing = false;

  function initialize() {
    // Event Listeners
    chatForm.addEventListener('submit', handleSubmit);
    themeSwitcher.addEventListener('click', toggleTheme);
    settingsButton.addEventListener('click', () => settingsModal.showModal());
    closeSettingsButton.addEventListener('click', () => settingsModal.close());
    cancelSettingsButton.addEventListener('click', () => settingsModal.close());
    saveSettingsButton.addEventListener('click', saveSettings);
    
    // --- ⭐️ จุดที่แก้ไข ---
    // แก้ไข Event Listener ให้เรียกทั้งสองฟังก์ชัน
    messageInput.addEventListener('input', () => {
        autoResizeInput.call(messageInput); // ปรับขนาด Textarea
        toggleSendButtonState();             // เปิด/ปิด ปุ่ม
    });

    messageInput.addEventListener('keydown', handleEnterKey);
    
    // Initial setup
    setupTheme();
    loadSettings();
    toggleSendButtonState();
  }

  // --- Core Functions ---
  async function handleSubmit(e) {
    e.preventDefault();
    if (isProcessing || !messageInput.value.trim()) return;

    if (!apiKey) {
      showToast('กรุณาใส่ Gemini API Key ในหน้าตั้งค่า', 'error');
      settingsModal.showModal();
      return;
    }
    
    const userInput = messageInput.value.trim();
    // addUserMessage(userInput); // Feature for later
    messageInput.value = '';
    autoResizeInput.call(messageInput); // Reset height after clearing

    const botMessageEl = createBotMessageContainer();
    
    setProcessingState(true);

    try {
      await streamGeminiResponse(userInput, botMessageEl);
    } catch (err) {
      const errorContent = botMessageEl.querySelector('.translation-output');
      const msg = err.message.includes('API key not valid') ? 'API Key ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' : `เกิดข้อผิดพลาด: ${err.message}`;
      errorContent.innerHTML = `<p class="error-message"><i class="fa-solid fa-triangle-exclamation"></i> ${msg}</p>`;
    } finally {
      setProcessingState(false);
    }
  }

  async function streamGeminiResponse(userInput, botMessageEl) {
    const outputEl = botMessageEl.querySelector('.translation-output');
    outputEl.innerHTML = `<p class="loading-text">กำลังแปล... ▌</p>`;
    scrollToBottom();
    
    const translationMode = languageSelector.value;
    const [source, target] = translationMode.split('-');
    const langMap = { th: 'Thai', en: 'English', ja: 'Japanese' };
    const systemInstructionText = `You are a professional translator. Translate the following text from ${langMap[source]} to ${langMap[target]}. Provide only the translated text, without any additional comments or explanations.`;
    
    const apiUrl = `${GEMINI_API_ENDPOINT}${currentModel}:streamGenerateContent?key=${apiKey}&alt=sse`;
    const requestBody = {
      contents: [{ parts: [{ text: userInput }] }],
      systemInstruction: { parts: [{ text: systemInstructionText }] }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error.message || `API responded with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    
    outputEl.style.whiteSpace = 'pre-wrap';

    const processStream = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              const parsed = JSON.parse(jsonStr);
              const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textPart) {
                fullText += textPart;
                requestAnimationFrame(() => {
                    outputEl.textContent = fullText + ' ▌';
                    scrollToBottom();
                });
              }
            } catch (err) {
              console.warn("Could not parse stream chunk:", line);
            }
          }
        }
      }
    };
    
    await processStream();
    
    outputEl.textContent = fullText.trim();
    if (fullText.trim()) {
        addCopyButton(botMessageEl, fullText.trim());
    }
  }

  // --- UI & State Management ---
  function setProcessingState(isProcessing) {
      this.isProcessing = isProcessing;
      toggleSendButtonState();
  }
  
  function createBotMessageContainer() {
    const article = document.createElement('article');
    article.className = 'message bot-message';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-content';
    bubble.innerHTML = `<div class="translation-output"></div>`;
    
    article.appendChild(bubble);
    messagesPanel.appendChild(article);
    scrollToBottom();
    return article;
  }
  
  function addCopyButton(container, text) {
    const btn = document.createElement('button');
    btn.className = 'copy-button';
    btn.title = 'Copy Translation';
    btn.setAttribute('aria-label', 'Copy translated text');
    btn.innerHTML = '<i class="fa-solid fa-copy"></i>';
    btn.onclick = () => {
      navigator.clipboard.writeText(text);
      showToast('คัดลอกคำแปลแล้ว!');
    };
    container.appendChild(btn);
  }
  
  function handleEnterKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.requestSubmit();
    }
  }
  
  function autoResizeInput() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  }

  function scrollToBottom() {
    messagesPanel.scrollTop = messagesPanel.scrollHeight;
  }
  
  function toggleSendButtonState() {
    sendButton.disabled = isProcessing || messageInput.value.trim() === '';
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    toast.addEventListener('animationend', () => toast.remove());
  }

  // --- Settings ---
  function setupTheme() {
    if (localStorage.getItem('theme') === 'dark') {
      document.body.classList.add('dark-mode');
    }
  }

  function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }

  function loadSettings() {
    apiKey = localStorage.getItem('geminiApiKey') || '';
    apiKeyInput.value = apiKey;
    currentModel = localStorage.getItem('geminiModelName') || DEFAULT_MODEL;
    modelNameInput.value = currentModel;
  }

  function saveSettings() {
    apiKey = apiKeyInput.value.trim();
    localStorage.setItem('geminiApiKey', apiKey);
    currentModel = modelNameInput.value.trim() || DEFAULT_MODEL;
    localStorage.setItem('geminiModelName', currentModel);
    settingsModal.close();
    showToast('บันทึกการตั้งค่าแล้ว');
  }

  // --- Initialize ---
  initialize();
});