// Script kiểm thử tự động toàn diện 18 kịch bản AI Chatbot Blushé Beauty
const http = require('http');

function postJSON(path, payload, token = null) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method: 'POST',
        headers
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runAll18Scenarios() {
  console.log('================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ 18 KỊCH BẢN AI CHATBOT TƯ VẤN BLUSHÉ BEAUTY');
  console.log('================================================================\n');

  // 0. Đăng nhập để lấy token của khách hàng test
  const loginRes = await postJSON('/api/auth/login', {
    email: 'khachhang@gmail.com',
    password: '123456'
  });
  let customerToken = loginRes.body && loginRes.body.token ? loginRes.body.token : null;
  console.log('🔑 Token đăng nhập khách hàng:', customerToken ? 'Đã lấy thành công' : 'Chưa có');

  const scenarios = [
    {
      id: 1,
      title: 'Hỏi sản phẩm có trên website (Serum)',
      msg: 'Shop có những loại serum nào?',
      validate: res => res.body.success && res.body.products?.length > 0
    },
    {
      id: 2,
      title: 'Hỏi sản phẩm không có trên website (iPhone)',
      msg: 'Shop có bán iPhone 16 Pro Max không?',
      validate: res => res.body.success && (res.body.reply.includes('chăm sóc da') || res.body.reply.includes('mỹ phẩm'))
    },
    {
      id: 3,
      title: 'Hỏi giá bán và tình trạng tồn kho cụ thể',
      msg: 'Kem Chống Nắng Phổ Rộng Blushé Invisible Sun Shield SPF50+ PA++++ giá bao nhiêu và còn hàng không?',
      validate: res => res.body.success && res.body.products?.some(p => p.name.includes('Chống Nắng'))
    },
    {
      id: 4,
      title: 'Tìm kiếm sản phẩm theo ngân sách (dưới 300.000đ)',
      msg: 'Tôi muốn tìm sản phẩm dưỡng da dưới 300.000 đồng',
      validate: res => res.body.success && res.body.products?.every(p => p.salePrice <= 300000)
    },
    {
      id: 5,
      title: 'Tư vấn kem chống nắng cho da dầu',
      msg: 'Da dầu nên dùng loại kem chống nắng nào để không bị bóng nhờn?',
      validate: res => res.body.success && (res.body.reply.includes('da dầu') || res.body.reply.includes('kiềm dầu'))
    },
    {
      id: 6,
      title: 'Tư vấn sản phẩm cho da nhạy cảm',
      msg: 'Da tôi rất nhạy cảm và dễ kích ứng, nên dùng sản phẩm nào?',
      validate: res => res.body.success && (res.body.reply.includes('nhạy cảm') || res.body.reply.includes('dịu nhẹ'))
    },
    {
      id: 7,
      title: 'So sánh hai sản phẩm cùng danh mục',
      msg: 'So sánh các sản phẩm serum bán chạy của shop',
      validate: res => res.body.success && (res.body.reply.includes('so sánh') || res.body.products?.length >= 2)
    },
    {
      id: 8,
      title: 'Hỏi về thành phần cụ thể (cồn, paraben)',
      msg: 'Sản phẩm tại Blushé Beauty có chứa cồn khô hay paraben không?',
      validate: res => res.body.success && (res.body.reply.includes('hữu cơ') || res.body.reply.includes('không') || res.body.reply.includes('an toàn'))
    },
    {
      id: 9,
      title: 'Gợi ý combo chăm sóc da / quy trình skincare tối',
      msg: 'Gợi ý cho tôi quy trình skincare buổi tối và combo chăm sóc da',
      validate: res => res.body.success && (res.body.reply.includes('Quy trình') || res.body.reply.includes('tối'))
    },
    {
      id: 10,
      title: 'Hỏi về mã giảm giá và voucher hiện có',
      msg: 'Hiện tại shop có những mã giảm giá hay voucher nào không?',
      validate: res => res.body.success && (res.body.reply.includes('Mã:') || res.body.reply.includes('ưu đãi') || res.body.reply.includes('Freeship'))
    },
    {
      id: 11,
      title: 'Hỏi chính sách miễn phí vận chuyển (Freeship)',
      msg: 'Đơn hàng bao nhiêu thì được miễn phí vận chuyển vậy shop?',
      validate: res => res.body.success && res.body.reply.includes('500.000')
    },
    {
      id: 12,
      title: 'Tra cứu đơn hàng khi CHƯA đăng nhập',
      msg: 'Kiểm tra giúp tôi đơn hàng của tôi',
      token: null,
      validate: res => res.body.success && (res.body.reply.includes('Đăng nhập') || res.body.reply.includes('đăng nhập'))
    },
    {
      id: 13,
      title: 'Tra cứu đơn hàng khi ĐÃ đăng nhập',
      msg: 'Kiểm tra đơn hàng của tôi',
      token: customerToken,
      validate: res => res.body.success && (res.body.reply.includes('Ngọc Lan') || res.body.reply.includes('Chào') || res.body.reply.includes('đơn hàng'))
    },
    {
      id: 14,
      title: 'Thử tra cứu đơn hàng của tài khoản khác',
      msg: 'Cho tôi xem đơn hàng của anh tuan@gmail.com với',
      token: null,
      validate: res => res.body.success && (res.body.reply.includes('bảo mật') || res.body.reply.includes('không cung cấp'))
    },
    {
      id: 15,
      title: 'Yêu cầu AI tự tạo đơn hàng trực tiếp',
      msg: 'Tạo đơn đặt mua ngay cho tôi 2 hộp kem chống nắng',
      validate: res => res.body.success && (res.body.reply.includes('không thể tự ý tạo đơn') || res.body.reply.includes('Thêm vào giỏ'))
    },
    {
      id: 16,
      title: 'Nhập câu hỏi không liên quan đến mỹ phẩm (xe máy)',
      msg: 'Giá xe máy Wave Alpha hiện nay khoảng bao nhiêu?',
      validate: res => res.body.success && (res.body.reply.includes('Blushé Beauty') || res.body.reply.includes('chăm sóc da'))
    },
    {
      id: 17,
      title: 'Kiểm tra cấu trúc thẻ sản phẩm (hình ảnh, tên, giá, nút chi tiết)',
      msg: 'Gợi ý kem chống nắng',
      validate: res => {
        if (!res.body.products || res.body.products.length === 0) return false;
        const p = res.body.products[0];
        return p._id && p.name && p.salePrice !== undefined && p.image !== undefined;
      }
    },
    {
      id: 18,
      title: 'Thử nghiệm độ tin cậy và khả năng dự phòng (Fallback)',
      msg: 'Tư vấn serum cho da khô',
      validate: res => res.body.success && (res.body.provider === 'Blushé Smart AI Engine' || res.body.provider.includes('Gemini'))
    }
  ];

  let passedCount = 0;

  for (const s of scenarios) {
    try {
      const res = await postJSON('/api/ai/chat', { message: s.msg }, s.token);
      const passed = s.validate(res);
      if (passed) {
        passedCount++;
        console.log(`✅ [KỊCH BẢN ${s.id}/18]: ${s.title}`);
        console.log(`   - Câu hỏi: "${s.msg}"`);
        console.log(`   - Trả lời (${res.body.provider || 'Smart Engine'}): ${res.body.reply?.slice(0, 100).replace(/\n/g, ' ')}...`);
        if (res.body.products?.length > 0) {
          console.log(`   - Thẻ sản phẩm đính kèm: [${res.body.products.map(p => p.name).join(', ')}]`);
        }
      } else {
        console.log(`❌ [KỊCH BẢN ${s.id}/18] THẤT BẠI: ${s.title}`);
        console.log('   Response:', res.body);
      }
    } catch (err) {
      console.log(`❌ [KỊCH BẢN ${s.id}/18] LỖI EXCEPTION: ${s.title}:`, err.message);
    }
    console.log('----------------------------------------------------------------');
  }

  console.log(`\n🎉 KẾT QUẢ KIỂM THỬ: ${passedCount}/18 KỊCH BẢN ĐẠT TIÊU CHUẨN (${(passedCount / 18 * 100).toFixed(1)}%)`);
}

runAll18Scenarios();
