/* ============================================
   LifeDrop — chatbot widget (UI + wiring)
   Call LifeDropChatbotWidget.mount() once per page, after chatbot-data.js.
   ============================================ */

const LifeDropChatbotWidget = (() => {
  let opened = false;

  function mount() {
    const launcher = document.createElement('button');
    launcher.className = 'chatbot-launcher';
    launcher.setAttribute('aria-label', 'Open help chat');
    launcher.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
    `;
    document.body.appendChild(launcher);

    let panel = null;

    launcher.addEventListener('click', () => {
      if (opened) {
        closePanel();
      } else {
        openPanel();
      }
    });

    function openPanel() {
      opened = true;
      panel = document.createElement('div');
      panel.className = 'chatbot-panel';
      panel.innerHTML = `
        <div class="chatbot-header">
          <div class="chatbot-header-title"><span class="dot"></span> LifeDrop Help</div>
          <button class="chatbot-close" aria-label="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="chatbot-body" id="chatbotBody"></div>
        <div class="chatbot-input-row">
          <input type="text" id="chatbotInput" placeholder="Ask a question…" autocomplete="off">
          <button class="chatbot-send" id="chatbotSend" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/></svg>
          </button>
        </div>
      `;
      document.body.appendChild(panel);

      const body = panel.querySelector('#chatbotBody');
      const input = panel.querySelector('#chatbotInput');
      const sendBtn = panel.querySelector('#chatbotSend');
      const closeBtn = panel.querySelector('.chatbot-close');

      addBotMessage(body, "Hi! I'm the LifeDrop assistant. Ask me anything about donating blood, eligibility, or how to use the site.");
      addSuggestions(body, input);

      closeBtn.addEventListener('click', closePanel);
      sendBtn.addEventListener('click', () => handleSend(body, input));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend(body, input);
      });

      input.focus();
    }

    function closePanel() {
      opened = false;
      if (panel) {
        panel.remove();
        panel = null;
      }
    }

    function handleSend(body, input) {
      const text = input.value.trim();
      if (!text) return;
      addUserMessage(body, text);
      input.value = '';
      showTyping(body);

      setTimeout(() => {
        removeTyping(body);
        const answer = LifeDropChatbot.findAnswer(text);
        addBotMessage(body, answer);
        body.scrollTop = body.scrollHeight;
      }, 500 + Math.random() * 400);

      body.scrollTop = body.scrollHeight;
    }

    function addUserMessage(body, text) {
      const el = document.createElement('div');
      el.className = 'chat-msg user';
      el.textContent = text;
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
    }

    function addBotMessage(body, text) {
      const el = document.createElement('div');
      el.className = 'chat-msg bot';
      el.textContent = text;
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
    }

    function addSuggestions(body, input) {
      const wrap = document.createElement('div');
      wrap.className = 'chat-suggestions';
      LifeDropChatbot.SUGGESTED_STARTERS.forEach((q) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chat-chip';
        chip.textContent = q;
        chip.addEventListener('click', () => {
          input.value = q;
          handleSend(body, input);
        });
        wrap.appendChild(chip);
      });
      body.appendChild(wrap);
    }

    function showTyping(body) {
      const el = document.createElement('div');
      el.className = 'typing-indicator';
      el.id = 'typingIndicator';
      el.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
    }

    function removeTyping(body) {
      const el = body.querySelector('#typingIndicator');
      if (el) el.remove();
    }
  }

  return { mount };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (typeof LifeDropChatbot !== 'undefined') {
    LifeDropChatbotWidget.mount();
  }
});
