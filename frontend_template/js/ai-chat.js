/**
 * =======================================================================
 * BLUSHÉ BEAUTY - LUXURY ORGANIC AI CHATBOT ASSISTANT
 * Tích hợp Google Gemini 3.8 Flash & Blushé Smart Engine RAG
 * =======================================================================
 */

let isChatOpen = false;

// Đóng/Mở cửa sổ Chatbot
function toggleAIChat() {
  const windowEl = document.getElementById('aiChatWindow');
  if (!windowEl) return;

  isChatOpen = !isChatOpen;
  if (isChatOpen) {
    windowEl.classList.remove('hidden');
    const input = document.getElementById('aiInput');
    if (input) {
      setTimeout(() => input.focus(), 150);
    }
  } else {
    windowEl.classList.add('hidden');
  }
}

// Bấm gửi câu hỏi nhanh từ thanh Pills
function sendQuickMessage(text) {
  const input = document.getElementById('aiInput');
  if (input) {
    input.value = text;
    sendAIMessage();
  }
}

// Gửi tin nhắn đến AI Assistant
async function sendAIMessage(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const input = document.getElementById('aiInput');
  const messagesContainer = document.getElementById('aiMessages');
  if (!input || !messagesContainer) return;

  const text = input.value.trim();
  if (!text) return;

  // 1. Hiển thị tin nhắn người dùng
  appendMessage(text, 'user');
  input.value = '';

  // 2. Hiển thị trạng thái "Chuyên viên AI đang tư vấn..."
  const typingId = 'typing-' + Date.now();
  const typingEl = document.createElement('div');
  typingEl.className = 'msg msg-ai';
  typingEl.id = typingId;
  typingEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span>🌿 Chuyên viên Blushé đang chuẩn bị câu trả lời</span>
      <div class="ai-typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesContainer.appendChild(typingEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  try {
    // 3. Gọi Backend API
    const res = await API.askAI(text);

    // 4. Xóa trạng thái đang gõ
    const activeTyping = document.getElementById(typingId);
    if (activeTyping) activeTyping.remove();

    // 5. Hiển thị phản hồi từ AI
    if (res && res.success) {
      appendMessage(res.reply, 'ai', res.products, res.provider);
      if (res.suggestions && Array.isArray(res.suggestions) && res.suggestions.length > 0) {
        updateQuickPills(res.suggestions);
      }
    } else {
      const errMsg = (res && res.message) || 'Hệ thống trợ lý Blushé Beauty đang bận trong giây lát. Bạn vui lòng thử lại nhé! 🌸';
      appendMessage(errMsg, 'ai');
    }
  } catch (error) {
    const activeTyping = document.getElementById(typingId);
    if (activeTyping) activeTyping.remove();

    console.error('Lỗi khi trò chuyện cùng AI:', error);
    appendMessage('Có lỗi xảy ra khi kết nối tới chuyên viên tư vấn. Vui lòng kiểm tra lại kết nối mạng!', 'ai');
  }
}

// Format Markdown nhẹ sang HTML an toàn
function formatAIMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-sage);padding:1px 4px;border-radius:4px;">$1</code>')
    .replace(/\n/g, '<br>');

  return html;
}

// Cập nhật danh sách câu hỏi gợi ý nhanh (Quick Pills)
function updateQuickPills(suggestions) {
  const pillsContainer = document.getElementById('aiQuickPills');
  if (!pillsContainer || !Array.isArray(suggestions)) return;

  pillsContainer.innerHTML = suggestions.map(s => {
    const cleanText = s.replace(/'/g, "\\'");
    return `<button class="ai-pill-btn" onclick="sendQuickMessage('${cleanText}')">✨ ${s}</button>`;
  }).join('');
}

// Render tin nhắn vào khung chat
function appendMessage(text, sender, products = [], provider = '') {
  const messagesContainer = document.getElementById('aiMessages');
  if (!messagesContainer) return;

  const msg = document.createElement('div');
  msg.className = `msg ${sender === 'user' ? 'msg-user' : 'msg-ai'}`;

  // Nội dung tin nhắn
  let messageContent = sender === 'user' ? text.replace(/\n/g, '<br>') : formatAIMarkdown(text);
  let html = `<div>${messageContent}</div>`;

  // Nếu là AI và có đính kèm thẻ sản phẩm tương tác
  if (sender === 'ai' && Array.isArray(products) && products.length > 0) {
    html += `<div class="chat-products-list">`;
    products.forEach(p => {
      const imgUrl = p.image || 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500';
      const salePriceVND = Number(p.salePrice || 0).toLocaleString('vi-VN') + ' đ';
      const origPriceVND = p.originalPrice > p.salePrice ? Number(p.originalPrice).toLocaleString('vi-VN') + ' đ' : '';
      const inStock = p.stock > 0;
      const stockBadge = inStock
        ? `<span class="chat-p-stock in-stock">Còn hàng</span>`
        : `<span class="chat-p-stock out-stock">Hết hàng</span>`;

      const safeName = (p.name || '').replace(/'/g, "\\'");

      html += `
        <div class="chat-product-card">
          <img src="${imgUrl}" alt="${p.name}" class="chat-p-img" onerror="this.src='https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500'" />
          <div class="chat-p-details">
            <div class="chat-p-brand">${p.brand || 'Blushé Naturals'}</div>
            <div class="chat-p-name" title="${p.name}">${p.name}</div>
            <div class="chat-p-pricing">
              <span class="chat-p-sale">${salePriceVND}</span>
              ${origPriceVND ? `<span style="text-decoration:line-through;color:var(--text-muted);font-size:10.5px;">${origPriceVND}</span>` : ''}
              ${stockBadge}
            </div>
          </div>
          <div class="chat-p-actions">
            <button class="chat-p-btn" onclick="openProductDetailModal('${p._id}')" title="Xem chi tiết sản phẩm">
              👁 Chi tiết
            </button>
            ${inStock ? `
            <button class="chat-p-btn cart" onclick="addToCart('${p._id}', '${safeName}', ${p.salePrice}, '${imgUrl}')" title="Thêm vào giỏ hàng">
              🛒 Thêm giỏ
            </button>
            ` : ''}
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  // Huy hiệu nhà cung cấp AI
  if (sender === 'ai' && provider) {
    html += `<div class="msg-provider-tag">✨ ${provider}</div>`;
  }

  msg.innerHTML = html;
  messagesContainer.appendChild(msg);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
