// Test Script: Kiểm tra độ chính xác và tốc độ phản hồi Chatbox AI Blushé Beauty
const http = require('http');

function postChat(message, token = null, history = []) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const payload = JSON.stringify({ message, token, history });
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/ai/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const durationMs = Date.now() - start;
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body), durationMs });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body, durationMs });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ 10 TIÊU CHÍ CHÍNH XÁC & ĐO TỐC ĐỘ PHẢN HỒI CHATBOX AI');
  console.log('========================================================================\n');

  const testCases = [
    {
      id: 1,
      name: 'Hỏi sản phẩm có thật trong Database',
      question: 'Shop có serum Estee Lauder không?',
      validate: (res) => {
        return res.body.success &&
          res.body.products?.some(p => p.name.includes('Estée Lauder')) &&
          res.body.reply.includes('Estée Lauder');
      }
    },
    {
      id: 2,
      name: 'Hỏi sản phẩm không tồn tại (Phải báo không tìm thấy)',
      question: 'Shop có bán son MAC Ruby Woo không?',
      validate: (res) => {
        return res.body.success &&
          res.body.reply.includes('chưa tìm thấy thông tin chính xác về sản phẩm này') &&
          (!res.body.products || res.body.products.length === 0);
      }
    },
    {
      id: 3,
      name: 'Hỏi giá sản phẩm cụ thể',
      question: 'Serum Estee Lauder giá bao nhiêu tiền?',
      validate: (res) => {
        return res.body.success &&
          res.body.reply.includes('3.450.000') &&
          res.body.products?.some(p => p.salePrice === 3450000);
      }
    },
    {
      id: 4,
      name: 'Hỏi số lượng tồn kho thực tế',
      question: 'Sữa rửa mặt hữu cơ Blushé còn bao nhiêu sản phẩm?',
      validate: (res) => {
        return res.body.success &&
          res.body.reply.includes('45') &&
          res.body.products?.some(p => p.stock === 45);
      }
    },
    {
      id: 5,
      name: 'Hỏi sản phẩm đã HẾT HÀNG (Phải báo hết hàng, không tư vấn còn)',
      question: 'Phấn nước Dior cushion còn hàng không shop?',
      validate: (res) => {
        return res.body.success &&
          res.body.reply.includes('HẾT HÀNG') &&
          !res.body.reply.includes('CÒN HÀNG trong kho') &&
          res.body.products?.some(p => p.stock === 0);
      }
    },
    {
      id: 6,
      name: 'Hỏi thành phần và công dụng',
      question: 'Thành phần của Kem Chống Nắng Blushé có những gì?',
      validate: (res) => {
        return res.body.success &&
          (res.body.reply.includes('thành phần') || res.body.reply.includes('Trà xanh') || res.body.reply.includes('Zinc Oxide')) &&
          res.body.products?.some(p => p.name.includes('Chống Nắng'));
      }
    },
    {
      id: 7,
      name: 'Hỏi so sánh hai sản phẩm',
      question: 'So sánh serum Estee Lauder và nước thần SK-II',
      validate: (res) => {
        return res.body.success &&
          res.body.reply.includes('so sánh') &&
          res.body.products?.length >= 2;
      }
    },
    {
      id: 8,
      name: 'Hỏi thông tin không liên quan đến website (xe máy)',
      question: 'Giá xe máy Wave Alpha hiện nay khoảng bao nhiêu?',
      validate: (res) => {
        return res.body.success &&
          res.body.reply.includes('chăm sóc da') &&
          res.body.reply.includes('Blushé Beauty');
      }
    },
    {
      id: 9,
      name: 'Hỏi thông tin không có trong Database (Kem trị mụn Differin)',
      question: 'Shop có bán kem Differin trị mụn không?',
      validate: (res) => {
        return res.body.success &&
          res.body.reply.includes('chưa tìm thấy thông tin chính xác về sản phẩm này');
      }
    },
    {
      id: 10,
      name: 'Hỏi thông tin đơn hàng khi chưa đăng nhập',
      question: 'Kiểm tra giúp tôi đơn hàng của tôi',
      validate: (res) => {
        return res.body.success &&
          (res.body.reply.includes('Đăng nhập') || res.body.reply.includes('đăng nhập'));
      }
    }
  ];

  let passedCount = 0;
  const speedRecords = [];

  for (const tc of testCases) {
    try {
      const res = await postChat(tc.question);
      const isPassed = tc.validate(res);
      speedRecords.push(res.durationMs);

      if (isPassed) {
        passedCount++;
        console.log(`✅ [TEST ${tc.id}/10]: ${tc.name}`);
      } else {
        console.log(`❌ [TEST ${tc.id}/10] THẤT BẠI: ${tc.name}`);
      }
      console.log(`   - Câu hỏi: "${tc.question}"`);
      console.log(`   - Tốc độ phản hồi: ${res.durationMs} ms (Mục tiêu: < 2000 ms)`);
      console.log(`   - Trả lời (${res.body.provider || 'Smart Engine'}): ${res.body.reply?.slice(0, 110).replace(/\n/g, ' ')}...`);
      if (res.body.products?.length > 0) {
        console.log(`   - Thẻ sản phẩm: [${res.body.products.map(p => p.name).join(', ')}]`);
      }
      console.log('------------------------------------------------------------------------');
    } catch (err) {
      console.log(`❌ [TEST ${tc.id}/10] LỖI KẾT NỐI: ${tc.name}:`, err.message);
    }
  }

  const avgSpeed = (speedRecords.reduce((a, b) => a + b, 0) / speedRecords.length).toFixed(0);
  console.log(`\n🎉 TỔNG KẾT KIỂM THỬ: ${passedCount}/10 TEST CASES ĐẠT CHUẨN (${(passedCount / 10 * 100).toFixed(0)}%)`);
  console.log(`⚡ TỐC ĐỘ PHẢN HỒI TRUNG BÌNH: ${avgSpeed} ms`);
  console.log(`   + Tốc độ nhanh nhất: ${Math.min(...speedRecords)} ms`);
  console.log(`   + Tốc độ chậm nhất: ${Math.max(...speedRecords)} ms`);
}

runTests();
