const { GoogleGenerativeAI } = require('@google/generative-ai');
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const User = require('../models/User');

// Helper định dạng tiền tệ VNĐ
const formatVND = (amount) => Number(amount || 0).toLocaleString('vi-VN') + ' đ';

// 1. Phân tích Token người dùng nếu có
async function getAuthenticatedUser(req) {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.body && req.body.token) {
      token = req.body.token;
    }
    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) return null;

    const user = await User.findById(decoded.id).select('name email phone role isBlocked');
    return user || null;
  } catch (err) {
    return null;
  }
}

// 2. Tra cứu đơn hàng của người dùng hiện tại
async function getUserOrderContext(user) {
  if (!user) return { isAuthenticated: false, orders: [] };
  try {
    const orders = await Order.find({
      $or: [
        { customerEmail: user.email },
        ...(user.phone ? [{ customerPhone: user.phone }] : [])
      ]
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    return { isAuthenticated: true, user, orders };
  } catch (err) {
    return { isAuthenticated: true, user, orders: [] };
  }
}

// 3. Smart Fallback Engine: Tư vấn thông minh trực tiếp từ CSDL MongoDB Atlas
function generateSmartFallbackReply({ message, products, coupons, userOrderContext }) {
  const lowerMsg = message.toLowerCase();
  let reply = '';
  let matchedProducts = [];
  let suggestions = [];

  // A. YÊU CẦU TẠO ĐƠN HÀNG TRỰC TIẾP (Kịch bản 15)
  if (
    lowerMsg.includes('tạo đơn') ||
    lowerMsg.includes('đặt hàng giúp') ||
    lowerMsg.includes('mua hộ') ||
    lowerMsg.includes('lên đơn cho tôi') ||
    lowerMsg.includes('chốt đơn cho tôi')
  ) {
    reply = `Dạ Blushé Beauty rất sẵn lòng hỗ trợ bạn! Để đảm bảo tính bảo mật và thông tin giao hàng chính xác, em không thể tự ý tạo đơn hàng trực tiếp thay cho bạn được ạ.\n\n` +
      `👉 Bạn chỉ cần bấm vào nút **"Xem chi tiết"** hoặc **"Thêm vào giỏ hàng"** ngay trên thẻ sản phẩm bên dưới, sau đó bấm vào biểu tượng Giỏ hàng để tiến hành đặt hàng và chọn hình thức thanh toán thuận tiện nhất nhé! 🌸`;
    suggestions = ['Xem giỏ hàng', 'Mã giảm giá hiện có', 'Chính sách vận chuyển'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // B. CHÍNH SÁCH VẬN CHUYỂN & FREESHIP (Kịch bản 11) - Đặt trước để không nhầm với tra cứu đơn
  if (
    lowerMsg.includes('vận chuyển') ||
    lowerMsg.includes('phí ship') ||
    lowerMsg.includes('giao hàng') ||
    lowerMsg.includes('freeship') ||
    lowerMsg.includes('miễn phí vận chuyển')
  ) {
    reply = `Dạ chính sách giao hàng của Blushé Beauty như sau ạ:\n\n` +
      `🚚 **Miễn phí vận chuyển (Freeship)**: Áp dụng cho tất cả đơn hàng có giá trị từ **500.000 đ** trở lên trên toàn quốc.\n` +
      `📦 **Phí vận chuyển tiêu chuẩn**: Đơn hàng dưới 500.000 đ có mức phí ship đồng giá là **30.000 đ**.\n` +
      `⏰ **Thời gian giao hàng dự kiến**:\n` +
      `• Khu vực nội thành: 1 - 2 ngày làm việc.\n` +
      `• Các tỉnh thành khác: 2 - 4 ngày làm việc.\n\n` +
      `Tất cả sản phẩm đều được đóng gói chống sốc kỹ lưỡng kèm tem niêm phong chính hãng. Bạn cần em tư vấn thêm sản phẩm nào không ạ? 🌿`;
    matchedProducts = products.slice(0, 3);
    suggestions = ['Mã giảm giá', 'Serum da dầu', 'Kem chống nắng'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // C. MÃ GIẢM GIÁ & VOUCHER (Kịch bản 10)
  if (
    lowerMsg.includes('mã giảm giá') ||
    lowerMsg.includes('voucher') ||
    lowerMsg.includes('khuyến mãi') ||
    lowerMsg.includes('coupon') ||
    (lowerMsg.includes('giảm giá') && !lowerMsg.includes('giá bao nhiêu'))
  ) {
    if (coupons.length > 0) {
      reply = `Dạ Blushé Beauty đang có các chương trình ưu đãi và mã giảm giá siêu hấp dẫn dành riêng cho bạn:\n\n`;
      coupons.forEach(c => {
        const valText = c.discountType === 'PERCENT' ? `${c.discountValue}%` : formatVND(c.discountValue);
        const minOrder = c.minOrderValue > 0 ? ` (Đơn từ ${formatVND(c.minOrderValue)})` : '';
        reply += `🎁 Mã: **${c.code}** - Giảm **${valText}**${minOrder}\n   _${c.description || 'Ưu đãi mua sắm mỹ phẩm'}_\n\n`;
      });
      reply += `✨ **Chính sách Freeship**: Miễn phí vận chuyển toàn quốc cho đơn hàng từ **500.000 đ**!\n` +
        `Bạn hãy chọn sản phẩm yêu thích và nhập mã tại bước thanh toán để nhận ưu đãi nhé! 🌸`;
    } else {
      reply = `Hiện tại Blushé Beauty đang áp dụng ưu đãi **Miễn phí vận chuyển toàn quốc cho mọi đơn hàng từ 500.000 đ** ạ! Bạn theo dõi thêm tại trang chủ để nhận các voucher mới nhất nhé. 🌸`;
    }
    matchedProducts = products.filter(p => p.isFeatured || p.isBestSeller).slice(0, 3);
    suggestions = ['Freeship từ bao nhiêu?', 'Kem chống nắng', 'Combo da dầu'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // D. THÀNH PHẦN, CỒN KHÔ, PARABEN, ĐỘ LÀNH TÍNH (Kịch bản 8)
  if (
    lowerMsg.includes('thành phần') ||
    lowerMsg.includes('cồn') ||
    lowerMsg.includes('paraben') ||
    lowerMsg.includes('hương liệu') ||
    lowerMsg.includes('chất bảo quản') ||
    lowerMsg.includes('lành tính')
  ) {
    reply = `Dạ triết lý cốt lõi của Blushé Beauty là **Luxury Organic Beauty - Mỹ phẩm hữu cơ chuẩn Châu Âu** an toàn và lành tính tuyệt đối:\n\n` +
      `🌱 **Cam kết 5 KHÔNG**:\n` +
      `1. ❌ **Không cồn khô (Alcohol-free)**: Không làm bào mòn hay khô căng biểu bì da.\n` +
      `2. ❌ **Không Paraben**: 100% không chứa chất bảo quản hóa học độc hại.\n` +
      `3. ❌ **Không hương liệu nhân tạo (Fragrance-free)**: Chỉ lưu giữ hương thơm thảo mộc tự nhiên dịu mát.\n` +
      `4. ❌ **Không dầu khoáng (Mineral oil-free)**: Không gây bít tắc lỗ chân lông hay sinh mụn ẩn.\n` +
      `5. ❌ **Không thử nghiệm trên động vật (Cruelty-free)**.\n\n` +
      `Tất cả sản phẩm đều được chiết xuất từ thảo dược hữu cơ đạt kiểm nghiệm da liễu nghiêm ngặt. Bạn đang quan tâm đến thành phần của sản phẩm nào để em hỗ trợ phân tích chi tiết nhé! 🌿🕊️`;
    matchedProducts = products.filter(p => p.isFeatured || p.isBestSeller).slice(0, 3);
    suggestions = ['Sữa rửa mặt hữu cơ', 'Serum phục hồi B5', 'Kem chống nắng nhạy cảm'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // E. TRA CỨU ĐƠN HÀNG (Kịch bản 12, 13, 14)
  if (
    lowerMsg.includes('đơn hàng của tôi') ||
    lowerMsg.includes('kiểm tra đơn hàng') ||
    lowerMsg.includes('tra cứu đơn') ||
    lowerMsg.includes('đơn của tôi') ||
    lowerMsg.includes('tình trạng đơn') ||
    (lowerMsg.includes('đơn hàng') && (lowerMsg.includes('kiểm tra') || lowerMsg.includes('xem') || lowerMsg.includes('@') || lowerMsg.includes('của')))
  ) {
    // Kiểm tra nếu cố tình hỏi đơn của người khác
    if (
      lowerMsg.includes('@') ||
      lowerMsg.includes('đơn của anh') ||
      lowerMsg.includes('đơn của chị') ||
      lowerMsg.includes('đơn của bạn') ||
      lowerMsg.includes('đơn người khác') ||
      lowerMsg.includes('đơn của ai')
    ) {
      reply = `Dạ vì lý do bảo mật và bảo vệ quyền riêng tư cá nhân theo quy định của Blushé Beauty, hệ thống tuyệt đối không cung cấp thông tin đơn hàng của khách hàng khác. Bạn chỉ có thể tra cứu đơn hàng của chính tài khoản mình sau khi đăng nhập nhé! 🔒🌸`;
      return { reply, products: [], suggestions: ['Đăng nhập tài khoản', 'Mã giảm giá hiện có'], provider: 'Blushé Smart AI Engine' };
    }

    if (!userOrderContext.isAuthenticated) {
      reply = `Dạ để bảo mật thông tin đơn hàng cá nhân, bạn vui lòng **Đăng nhập tài khoản** Blushé Beauty của mình trước nhé! Sau khi đăng nhập, em sẽ hỗ trợ tra cứu chi tiết hành trình đơn hàng của bạn ngay lập tức ạ. 📦🌸`;
      suggestions = ['Đăng nhập ngay', 'Chính sách vận chuyển', 'Tư vấn sản phẩm'];
      return { reply, products: [], suggestions, provider: 'Blushé Smart AI Engine' };
    }

    const { user, orders } = userOrderContext;
    if (orders.length === 0) {
      reply = `Chào ${user.name}! Em đã kiểm tra tài khoản (${user.email}) nhưng chưa thấy bạn có đơn hàng nào tại Blushé Beauty. Bạn hãy dạo qua danh mục sản phẩm và chọn cho mình các sản phẩm chăm sóc da ưng ý nhé! ✨`;
      matchedProducts = products.slice(0, 3);
      suggestions = ['Serum dưỡng ẩm', 'Kem chống nắng hữu cơ', 'Mã giảm giá'];
    } else {
      reply = `Chào ${user.name}! Em xin gửi thông tin đơn hàng gần nhất của bạn tại Blushé Beauty:\n\n`;
      orders.forEach((o, idx) => {
        const statusMap = {
          PENDING: 'Chờ xử lý ⏳',
          CONFIRMED: 'Đã xác nhận ✔️',
          SHIPPING: 'Đang vận chuyển 🚚',
          COMPLETED: 'Đã giao thành công 🎉',
          CANCELLED: 'Đã hủy ❌'
        };
        const statusText = statusMap[o.orderStatus] || o.orderStatus;
        reply += `📦 **Đơn hàng #${o.orderCode}**\n` +
          `• Ngày đặt: ${new Date(o.createdAt).toLocaleDateString('vi-VN')}\n` +
          `• Trạng thái: **${statusText}**\n` +
          `• Tổng tiền: **${formatVND(o.totalAmount)}** (${o.paymentMethod})\n` +
          `• Địa chỉ: ${o.shippingAddress}\n` +
          `• Sản phẩm: ${o.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}\n\n`;
      });
      reply += `Bạn cần hỗ trợ thêm thông tin gì về đơn hàng cứ nhắn cho em nhé! 🌸`;
      suggestions = ['Thời gian giao hàng', 'Chính sách đổi trả', 'Sản phẩm mua lại'];
    }
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // E. QUY TRÌNH SKINCARE SÁNG / TỐI (Kịch bản 9)
  if (
    lowerMsg.includes('quy trình') ||
    lowerMsg.includes('các bước') ||
    lowerMsg.includes('buổi sáng') ||
    lowerMsg.includes('buổi tối') ||
    lowerMsg.includes('routine') ||
    lowerMsg.includes('thứ tự')
  ) {
    if (lowerMsg.includes('sáng')) {
      reply = `Dạ em xin chia sẻ **Quy trình Skincare Buổi Sáng** chuẩn khoa học giúp bảo vệ và giữ da rạng rỡ cả ngày:\n\n` +
        `1️⃣ **Sữa rửa mặt dịu nhẹ**: Làm sạch dầu nhờn và cặn dưỡng qua đêm.\n` +
        `2️⃣ **Toner cân bằng**: Phục hồi độ pH tự nhiên cho da.\n` +
        `3️⃣ **Serum cấp ẩm / Vitamin C**: Chống oxy hóa và tăng cường hàng rào bảo vệ.\n` +
        `4️⃣ **Kem dưỡng ẩm mỏng nhẹ**: Giữ nước mà không gây bí tắc.\n` +
        `5️⃣ **Kem chống nắng (Bắt buộc)**: Thoa trước khi ra ngoài 20 phút (SPF 50+ PA++++).\n\n` +
        `💡 _Lưu ý: Luôn thoa lại kem chống nắng sau mỗi 3-4 tiếng nếu hoạt động ngoài trời bạn nhé!_`;
      matchedProducts = products.filter(p => {
        const cat = p.category ? p.category.name.toLowerCase() : '';
        return cat.includes('chống nắng') || cat.includes('sữa rửa mặt') || cat.includes('dưỡng');
      }).slice(0, 3);
    } else {
      reply = `Dạ em xin chia sẻ **Quy trình Skincare Buổi Tối** phục hồi chuyên sâu cùng Blushé Beauty:\n\n` +
        `1️⃣ **Tẩy trang**: Làm sạch lớp chống nắng, bụi mịn và bã nhờn sâu trong lỗ chân lông.\n` +
        `2️⃣ **Sữa rửa mặt hữu cơ**: Làm sạch kép (Double Cleansing) dịu nhẹ.\n` +
        `3️⃣ **Tẩy tế bào chết**: Sử dụng 1-2 lần/tuần để thông thoáng lỗ chân lông.\n` +
        `4️⃣ **Toner cân bằng ẩm**: Cấp nước tức thì và làm mềm biểu bì da.\n` +
        `5️⃣ **Serum đặc trị / Phục hồi**: Tái tạo da trong giấc ngủ (B5, Niacinamide, Hyaluronic Acid).\n` +
        `6️⃣ **Kem dưỡng ẩm khóa ẩm**: Khóa các dưỡng chất không bị bay hơi.\n\n` +
        `Dưới đây là các sản phẩm lành tính phù hợp nhất cho chu trình dưỡng da ban đêm:`;
      matchedProducts = products.filter(p => {
        const cat = p.category ? p.category.name.toLowerCase() : '';
        return cat.includes('serum') || cat.includes('kem dưỡng') || cat.includes('tẩy trang');
      }).slice(0, 3);
    }
    suggestions = ['Quy trình sáng', 'Quy trình tối', 'Kem chống nắng', 'Combo da dầu'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // F. LỌC THEO NGÂN SÁCH (Kịch bản 4)
  const budgetMatch = lowerMsg.match(/(dưới|tầm|khoảng|ngân sách)\s*(\d+)\s*(k|nghìn|ngàn|triệu|tr|000)/);
  if (budgetMatch || lowerMsg.includes('dưới 300') || lowerMsg.includes('dưới 500') || lowerMsg.includes('dưới 1 triệu') || lowerMsg.includes('200.000')) {
    let maxPrice = 500000;
    if (lowerMsg.includes('200.000') || lowerMsg.includes('200k')) maxPrice = 200000;
    else if (lowerMsg.includes('300.000') || lowerMsg.includes('300k') || lowerMsg.includes('300')) maxPrice = 300000;
    else if (lowerMsg.includes('400.000') || lowerMsg.includes('400k')) maxPrice = 400000;
    else if (lowerMsg.includes('500.000') || lowerMsg.includes('500k') || lowerMsg.includes('500')) maxPrice = 500000;
    else if (lowerMsg.includes('1 triệu') || lowerMsg.includes('1tr')) maxPrice = 1000000;

    matchedProducts = products.filter(p => p.salePrice <= maxPrice && p.stock > 0);
    if (matchedProducts.length > 0) {
      reply = `Dạ với mức ngân sách dưới **${formatVND(maxPrice)}**, em đã chọn lọc các sản phẩm chất lượng cao, đang còn sẵn hàng tại Blushé Beauty dành cho bạn:\n\n` +
        matchedProducts.map(p => `• **${p.name}** - Giá: **${formatVND(p.salePrice)}** (${p.skinType || 'Mọi loại da'}, còn ${p.stock} sản phẩm)`).join('\n') +
        `\n\nTất cả sản phẩm đều có thành phần hữu cơ an toàn. Bạn xem chi tiết sản phẩm bên dưới nhé! 🌿`;
    } else {
      reply = `Dạ với ngân sách dưới ${formatVND(maxPrice)}, hiện các sản phẩm trong tầm giá này đang tạm hết hàng. Em xin giới thiệu các sản phẩm có mức giá gần nhất với chất lượng tối ưu nhất ạ! 🌸`;
      matchedProducts = products.filter(p => p.stock > 0).sort((a, b) => a.salePrice - b.salePrice).slice(0, 3);
    }
    suggestions = ['Dưới 300k', 'Dưới 500k', 'Freeship từ bao nhiêu?'];
    return { reply, products: matchedProducts.slice(0, 4), suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // G. TƯ VẤN KEM CHỐNG NẮNG CHO DA DẦU / NHẠY CẢM (Kịch bản 5, 6)
  if (lowerMsg.includes('kem chống nắng') || lowerMsg.includes('chống nắng')) {
    matchedProducts = products.filter(p => {
      const cat = p.category ? p.category.name.toLowerCase() : '';
      return p.name.toLowerCase().includes('chống nắng') || cat.includes('chống nắng');
    });

    if (lowerMsg.includes('da dầu') || lowerMsg.includes('dầu')) {
      reply = `Dạ đối với **làn da dầu hoặc hỗn hợp thiên dầu**, việc chọn kem chống nắng cần đảm bảo: kết cấu mỏng nhẹ, kiềm dầu tốt, không chứa cồn khô gây kích ứng và không gây bí tắc lỗ chân lông (Non-comedogenic).\n\n` +
        `✨ Blushé Beauty xin giới thiệu dòng kem chống nắng khoáng chất kiềm dầu quang phổ rộng SPF 50+ PA++++ với chiết xuất trà xanh hữu cơ, vừa bảo vệ da tối ưu vừa giữ bề mặt da ráo mịn suốt cả ngày! ☀️🌿`;
    } else if (lowerMsg.includes('nhạy cảm') || lowerMsg.includes('dị ứng')) {
      reply = `Dạ với **làn da nhạy cảm**, bạn nên ưu tiên kem chống nắng vật lý (Physical Sunscreen) với màng lọc Zinc Oxide / Titanium Dioxide kết hợp chiết xuất làm dịu như hoa cúc, rau má, 100% không paraben và hương liệu nhân tạo.\n\n` +
        `✨ Sản phẩm chống nắng tại Blushé Beauty được kiểm nghiệm an toàn cho da nhạy cảm, giúp làm dịu và bảo vệ da toàn diện trước tia UVA, UVB và ánh sáng xanh:`;
    } else {
      reply = `Dạ kem chống nắng là bước bảo vệ tối quan trọng trong chu trình làm đẹp. Em xin gửi bạn các sản phẩm chống nắng bán chạy nhất tại Blushé Beauty với màng lọc quang phổ rộng bảo vệ da toàn diện: ☀️`;
    }
    suggestions = ['Kem chống nắng da dầu', 'Kem chống nắng da nhạy cảm', 'Quy trình sáng'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // H. TƯ VẤN THEO LOẠI DA (DẦU, KHÔ, NHẠY CẢM, MỤN) (Kịch bản 5, 6)
  if (lowerMsg.includes('da dầu') || lowerMsg.includes('da nhờn') || lowerMsg.includes('kiềm dầu') || lowerMsg.includes('mụn')) {
    matchedProducts = products.filter(p => {
      const st = (p.skinType || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return st.includes('dầu') || st.includes('mụn') || desc.includes('kiềm dầu') || desc.includes('trà xanh') || desc.includes('tràm trà');
    });
    if (matchedProducts.length === 0) matchedProducts = products.slice(0, 3);
    reply = `Dạ với **làn da dầu, dễ nổi mụn**, chìa khóa chăm sóc là làm sạch sâu dịu nhẹ và kiểm soát bã nhờn mà không làm khô căng da. Em gợi ý bạn các sản phẩm chứa chiết xuất Tràm trà, Trà xanh hữu cơ và Niacinamide giúp kiềm dầu, kháng viêm và se khít lỗ chân lông hiệu quả:\n\n` +
      `💡 _Lưu ý da liễu: Các sản phẩm hữu cơ tại Blushé Beauty hỗ trợ cân bằng tuyến dầu và ngừa mụn dịu nhẹ. Nếu da có tình trạng mụn viêm nang diện rộng, bạn nên kết hợp tham vấn bác sĩ da liễu nhé!_`;
    suggestions = ['Sữa rửa mặt da dầu', 'Serum kiềm dầu', 'Kem chống nắng da dầu'];
    return { reply, products: matchedProducts.slice(0, 3), suggestions, provider: 'Blushé Smart AI Engine' };
  }

  if (lowerMsg.includes('da khô') || lowerMsg.includes('thiếu ẩm') || lowerMsg.includes('bong tróc')) {
    matchedProducts = products.filter(p => {
      const st = (p.skinType || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return st.includes('khô') || desc.includes('cấp ẩm') || desc.includes('dưỡng ẩm') || desc.includes('hyaluronic');
    });
    if (matchedProducts.length === 0) matchedProducts = products.slice(0, 3);
    reply = `Dạ đối với **làn da khô, thiếu ẩm**, da rất dễ xuất hiện nếp nhăn li ti và thô ráp nếu không được cấp nước đủ. Bạn nên tập trung vào các sản phẩm giàu Hyaluronic Acid, Ceramide và Vitamin B5 để củng cố màng lipid khóa ẩm tự nhiên cho da:\n\n` +
      `Dưới đây là các sản phẩm dưỡng ẩm chuyên sâu giàu dưỡng chất hữu cơ dành riêng cho bạn: 💧✨`;
    suggestions = ['Serum cấp ẩm', 'Kem dưỡng da khô', 'Quy trình tối'];
    return { reply, products: matchedProducts.slice(0, 3), suggestions, provider: 'Blushé Smart AI Engine' };
  }

  if (lowerMsg.includes('nhạy cảm') || lowerMsg.includes('kích ứng') || lowerMsg.includes('mẩn đỏ')) {
    matchedProducts = products.filter(p => {
      const st = (p.skinType || '').toLowerCase();
      return st.includes('nhạy cảm') || st.includes('mọi loại da');
    });
    if (matchedProducts.length === 0) matchedProducts = products.slice(0, 3);
    reply = `Dạ **da nhạy cảm** cần được nâng niu bằng công thức tối giản, lành tính với độ pH chuẩn 5.5, tuyệt đối không chứa cồn khô, parabens hay hương liệu hóa học. Các sản phẩm tại Blushé Beauty chiết xuất từ rau má hữu cơ và hoa cúc La Mã sẽ giúp làm dịu tức thì các vết đỏ rát và phục hồi màng bảo vệ da mỏng manh:\n\n` +
      `Em xin gợi ý các dòng sản phẩm an toàn nhất cho làn da của bạn: 🌿🕊️`;
    suggestions = ['Kem chống nắng nhạy cảm', 'Sữa rửa mặt dịu nhẹ', 'Serum phục hồi B5'];
    return { reply, products: matchedProducts.slice(0, 3), suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // I. TƯ VẤN COMBO SẢN PHẨM (Kịch bản 9)
  if (lowerMsg.includes('combo') || lowerMsg.includes('bộ sản phẩm') || lowerMsg.includes('set')) {
    matchedProducts = products.slice(0, 3);
    const totalPrice = matchedProducts.reduce((sum, p) => sum + p.salePrice, 0);
    reply = `Dạ Blushé Beauty gợi ý bạn **Bộ chăm sóc da hữu cơ cơ bản (Cleanser - Serum - Moisturizer)** gồm các bước tối ưu:\n\n` +
      matchedProducts.map((p, idx) => `${idx + 1}. **${p.name}** (${p.volume}) - ${formatVND(p.salePrice)}`).join('\n') +
      `\n\n💰 **Tổng giá bộ sản phẩm**: **${formatVND(totalPrice)}**\n` +
      `🎁 _Đặc biệt: Đơn hàng trên 500.000 đ sẽ được **Miễn phí vận chuyển toàn quốc** ngay lập tức!_ Bạn có thể xem từng món bên dưới nhé! 🌸`;
    suggestions = ['Combo da dầu', 'Combo da khô', 'Mã giảm giá'];
    return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
  }

  // J. TÌM THEO TÊN / DANH MỤC CỤ THỂ HOẶC SẢN PHẨM CÓ TRÊN WEB (Kịch bản 1, 3, 7, 8)
  for (const p of products) {
    if (lowerMsg.includes(p.name.toLowerCase())) {
      matchedProducts = [p];
      const stockStatus = p.stock > 0 ? `còn **${p.stock}** sản phẩm trong kho` : `hiện đang **TẠM HẾT HÀNG** ❌`;
      reply = `Dạ sản phẩm **${p.name}** thuộc thương hiệu **${p.brand}** đang có giá bán ưu đãi là **${formatVND(p.salePrice)}** (Giá gốc: ${formatVND(p.originalPrice)}), ${stockStatus}.\n\n` +
        `• **Loại da phù hợp**: ${p.skinType}\n` +
        `• **Dung tích/Khối lượng**: ${p.volume} - Xuất xứ: ${p.origin}\n` +
        `• **Thành phần chính**: ${p.ingredients}\n` +
        `• **Công dụng**: ${p.description}\n` +
        `• **Cách sử dụng**: ${p.usage}\n\n` +
        `Bạn có thể bấm vào thẻ sản phẩm bên dưới để xem thêm đánh giá và thêm vào giỏ hàng nhé! 🌿`;
      suggestions = ['Cách sử dụng', 'Mã giảm giá áp dụng', 'Sản phẩm tương tự'];
      return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
    }
  }

  // Tìm theo danh mục
  const catKeywords = ['serum', 'sữa rửa mặt', 'toner', 'nước hoa hồng', 'kem dưỡng', 'mặt nạ', 'tẩy trang', 'son', 'nước hoa'];
  for (const kw of catKeywords) {
    if (lowerMsg.includes(kw)) {
      matchedProducts = products.filter(p => {
        const cat = p.category ? p.category.name.toLowerCase() : '';
        return p.name.toLowerCase().includes(kw) || cat.includes(kw);
      });
      if (matchedProducts.length > 0) {
        reply = `Dạ Blushé Beauty có các dòng sản phẩm **${kw.toUpperCase()}** chiết xuất thiên nhiên rất được yêu thích dưới đây ạ:\n\n` +
          `Mỗi sản phẩm đều có thành phần hữu cơ chọn lọc, đảm bảo an toàn cho da. Bạn có thể bấm vào thẻ sản phẩm để xem chi tiết nhé! 🌿`;
        suggestions = ['Giá dưới 300k', 'Cho da dầu', 'Cho da nhạy cảm'];
        return { reply, products: matchedProducts.slice(0, 3), suggestions, provider: 'Blushé Smart AI Engine' };
      }
    }
  }

  // K. SO SÁNH SẢN PHẨM (Kịch bản 7)
  if (lowerMsg.includes('so sánh') || lowerMsg.includes('khác nhau')) {
    matchedProducts = products.slice(0, 2);
    if (matchedProducts.length >= 2) {
      const p1 = matchedProducts[0];
      const p2 = matchedProducts[1];
      reply = `Dạ em xin so sánh nhanh giữa hai sản phẩm bán chạy tại Blushé Beauty dựa trên thông số thực tế:\n\n` +
        `1️⃣ **${p1.name}**:\n` +
        `• Giá: **${formatVND(p1.salePrice)}** | Dung tích: ${p1.volume} | Tồn kho: ${p1.stock > 0 ? p1.stock : 'Hết hàng'}\n` +
        `• Loại da: ${p1.skinType}\n` +
        `• Thành phần nổi bật: ${p1.ingredients}\n\n` +
        `2️⃣ **${p2.name}**:\n` +
        `• Giá: **${formatVND(p2.salePrice)}** | Dung tích: ${p2.volume} | Tồn kho: ${p2.stock > 0 ? p2.stock : 'Hết hàng'}\n` +
        `• Loại da: ${p2.skinType}\n` +
        `• Thành phần nổi bật: ${p2.ingredients}\n\n` +
        `👉 Tùy theo nhu cầu cấp ẩm hay kiềm dầu và ngân sách mà bạn có thể lựa chọn sản phẩm phù hợp nhất nhé! 🌸`;
      suggestions = ['Chọn sản phẩm 1', 'Chọn sản phẩm 2', 'Mã giảm giá'];
      return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
    }
  }

  // L. HỎI SẢN PHẨM KHÔNG CÓ TRÊN WEBSITE HOẶC NGOÀI PHẠM VI (Kịch bản 2, 16)
  const outOfScopeKeywords = ['iphone', 'điện thoại', 'máy tính', 'laptop', 'xe máy', 'chứng khoán', 'thời tiết', 'bóng đá', 'thời sự', 'bitcoin', 'quần áo'];
  for (const badKw of outOfScopeKeywords) {
    if (lowerMsg.includes(badKw)) {
      reply = `Dạ em là **Blushé Beauty AI Assistant** - chuyên viên tư vấn làm đẹp và mỹ phẩm hữu cơ ạ! 🌸\n\n` +
        `Hiện tại em chỉ hỗ trợ các câu hỏi liên quan đến chăm sóc da, mỹ phẩm, quy trình skincare và thông tin sản phẩm của Blushé Beauty. Bạn đang quan tâm đến sản phẩm chăm sóc da nào để em tư vấn nhé! ✨`;
      matchedProducts = products.filter(p => p.isFeatured || p.isBestSeller).slice(0, 3);
      suggestions = ['Tư vấn da dầu mụn', 'Kem chống nắng hữu cơ', 'Mã giảm giá hôm nay'];
      return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
    }
  }

  // M. MẶC ĐỊNH THÂN THIỆN (CHÀO HỎI & GỢI Ý)
  reply = `Chào bạn! Em là **Blushé Beauty AI Assistant** 🌿. Em rất vui được đồng hành cùng bạn trong hành trình chăm sóc làn da khỏe đẹp và rạng rỡ tự nhiên.\n\n` +
    `Bạn có thể chia sẻ tình trạng da hiện tại (da dầu, da khô, da nhạy cảm...) hoặc sản phẩm bạn đang tìm kiếm (serum, kem chống nắng, sữa rửa mặt...) để em tư vấn chi tiết nhé! 🌸`;
  matchedProducts = products.filter(p => p.isFeatured || p.isBestSeller).slice(0, 3);
  if (matchedProducts.length === 0) matchedProducts = products.slice(0, 3);
  suggestions = ['Da dầu nên dùng gì?', 'Kem chống nắng da nhạy cảm', 'Mã giảm giá hôm nay', 'Quy trình skincare tối'];

  return { reply, products: matchedProducts, suggestions, provider: 'Blushé Smart AI Engine' };
}

// [POST] /api/ai/chat - Trợ lý AI Tư vấn Mỹ phẩm Blushé Beauty
exports.chatWithAI = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập câu hỏi để chuyên viên AI tư vấn!'
      });
    }

    const trimmedMsg = message.trim();

    // 1. Lấy thông tin xác thực người dùng (nếu có)
    const currentUser = await getAuthenticatedUser(req);
    const userOrderContext = await getUserOrderContext(currentUser);

    // 2. Lấy dữ liệu danh mục, sản phẩm và coupons thời gian thực từ MongoDB Atlas
    const [products, coupons] = await Promise.all([
      Product.find({ status: 'ACTIVE' })
        .populate('category', 'name')
        .select('name category brand originalPrice salePrice stock image description ingredients usage skinType volume origin rating isFeatured isBestSeller')
        .lean(),
      Coupon.find({ isActive: true, expiryDate: { $gte: new Date() } })
        .select('code description discountType discountValue minOrderValue')
        .lean()
    ]);

    // 3. Chuẩn bị tài liệu RAG chi tiết cho AI
    const productCatalogText = products.map((p, idx) => {
      const catName = p.category ? p.category.name : 'Mỹ phẩm';
      return `[ID: ${p._id}] ${idx + 1}. "${p.name}" | Thương hiệu: ${p.brand} | Danh mục: ${catName} | Giá bán: ${formatVND(p.salePrice)} (Gốc: ${formatVND(p.originalPrice)}) | Kho: ${p.stock > 0 ? p.stock + ' sản phẩm' : 'HẾT HÀNG'} | Loại da: ${p.skinType} | Dung tích: ${p.volume} | Xuất xứ: ${p.origin} | Thành phần: ${p.ingredients} | Công dụng: ${p.description}`;
    }).join('\n');

    const couponCatalogText = coupons.length > 0
      ? coupons.map(c => `• Mã: ${c.code} - Giảm ${c.discountType === 'PERCENT' ? c.discountValue + '%' : formatVND(c.discountValue)} (Đơn tối thiểu: ${formatVND(c.minOrderValue)}). ${c.description}`).join('\n')
      : 'Hiện chưa có mã coupon đặc biệt, áp dụng freeship đơn từ 500.000đ.';

    let userOrderText = 'Khách chưa đăng nhập tài khoản.';
    if (userOrderContext.isAuthenticated) {
      if (userOrderContext.orders.length > 0) {
        userOrderText = `Khách hàng đã đăng nhập: "${userOrderContext.user.name}" (${userOrderContext.user.email}). Có ${userOrderContext.orders.length} đơn hàng gần nhất:\n` +
          userOrderContext.orders.map(o => `+ Mã đơn #${o.orderCode}: Trạng thái ${o.orderStatus}, Tổng tiền ${formatVND(o.totalAmount)}, Ngày đặt ${new Date(o.createdAt).toLocaleDateString('vi-VN')}`).join('\n');
      } else {
        userOrderText = `Khách hàng đã đăng nhập: "${userOrderContext.user.name}" (${userOrderContext.user.email}). Chưa có đơn hàng nào.`;
      }
    }

    const systemInstruction = `
Bạn là "Blushé Beauty AI Assistant" - Chuyên viên tư vấn sắc đẹp và mỹ phẩm hữu cơ cao cấp của thương hiệu Blushé Beauty.
Phong cách giao tiếp: Tinh tế, nhẹ nhàng, lịch sự, thân thiện, mang hơi hướng Luxury Organic Beauty.
Xưng hô: Luôn xưng "Em" hoặc "Blushé Beauty", gọi khách hàng là "Bạn" hoặc "Quý khách".

THÔNG TIN SẢN PHẨM THỰC TẾ TRONG KHO (MONGODB ATLAS):
${productCatalogText}

THÔNG TIN VOUCHER & CHÍNH SÁCH VẬN CHUYỂN:
${couponCatalogText}
• Miễn phí vận chuyển (Freeship) cho toàn bộ đơn hàng từ 500.000 đ. Đơn dưới 500.000 đ phí vận chuyển là 30.000 đ.

THÔNG TIN TÀI KHOẢN VÀ ĐƠN HÀNG CỦA KHÁCH:
${userOrderText}

QUY TẮC BẮT BUỘC (TUYỆT ĐỐI TUÂN THỦ):
1. CHỈ tư vấn và báo giá dựa trên danh sách sản phẩm THỰC TẾ ở trên. TUYỆT ĐỐI KHÔNG tự bịa tên sản phẩm, giá bán, thành phần hoặc cam kết vô căn cứ.
2. Sản phẩm có tồn kho = 0 là HẾT HÀNG. Không được giới thiệu sản phẩm hết hàng như sản phẩm có thể giao ngay.
3. Nếu khách hỏi sản phẩm KHÔNG CÓ trên website hoặc hỏi chủ đề ngoài mỹ phẩm (xe máy, đồ công nghệ, thời tiết...): Từ chối lịch sự và khéo léo hướng khách hàng quay lại chủ đề mỹ phẩm, chăm sóc da của Blushé Beauty.
4. TƯ VẤN Y KHOA & DA LIỄU: Mỹ phẩm hỗ trợ nuôi dưỡng và phục hồi da hàng ngày. Không khẳng định trị dứt điểm bệnh da liễu nặng; khuyên khách tham khảo bác sĩ da liễu khi bị viêm da dị ứng nặng.
5. KHÔNG TỰ Ý TẠO ĐƠN HÀNG: Khi khách yêu cầu tạo đơn/lên đơn hộ, lịch sự giải thích và mời khách bấm vào nút "Xem chi tiết" hoặc "Thêm vào giỏ" trên thẻ sản phẩm bên dưới để tự đặt hàng an toàn.
6. TRA CỨU ĐƠN HÀNG:
   - Nếu khách chưa đăng nhập: Nhắc khách bấm Đăng nhập để bảo mật thông tin đơn hàng cá nhân.
   - Nếu khách đã đăng nhập: Báo cáo đúng trạng thái các đơn hàng của khách.
   - TUYỆT ĐỐI KHÔNG tiết lộ thông tin đơn hàng của bất kỳ ai khác.
7. ĐỊNH DẠNG SẢN PHẨM ĐỀ XUẤT:
   Cuối câu trả lời, hãy đính kèm danh sách mã ID của các sản phẩm bạn gợi ý (tối đa 3 sản phẩm) theo định dạng:
   [RECOMMENDED_PRODUCTS: ID_1, ID_2]
`;

    // 4. Thử gọi Google Gemini API với mô hình gemini-3.8-flash (có timeout 4.5s)
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'AIzaSyDemoKeyYourGeminiApiKeyHere12345') {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-3.8-flash',
          systemInstruction
        });

        // Đặt timeout 4.5s để đảm bảo trải nghiệm người dùng không bị lag
        const geminiPromise = model.generateContent(`Khách hàng nhắn: "${trimmedMsg}". Hãy tư vấn chi tiết.`);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini API timeout')), 4500));

        const result = await Promise.race([geminiPromise, timeoutPromise]);
        let textReply = result.response.text();

        // Trích xuất ID sản phẩm được đề xuất từ định dạng [RECOMMENDED_PRODUCTS: ...]
        let recommendedIds = [];
        const matchRec = textReply.match(/\[RECOMMENDED_PRODUCTS:\s*([^\]]+)\]/i);
        if (matchRec) {
          recommendedIds = matchRec[1].split(',').map(s => s.trim());
          textReply = textReply.replace(/\[RECOMMENDED_PRODUCTS:\s*([^\]]+)\]/gi, '').trim();
        }

        // Lấy danh sách sản phẩm thực tế theo ID hoặc tìm theo tên có trong văn bản trả lời
        let cardProducts = products.filter(p => recommendedIds.includes(String(p._id)));
        if (cardProducts.length === 0) {
          cardProducts = products.filter(p => textReply.toLowerCase().includes(p.name.toLowerCase())).slice(0, 3);
        }
        if (cardProducts.length === 0) {
          // Lọc thông minh theo từ khóa trong câu hỏi
          const lower = trimmedMsg.toLowerCase();
          cardProducts = products.filter(p => {
            const cat = p.category ? p.category.name.toLowerCase() : '';
            return lower.includes(p.name.toLowerCase()) ||
              (lower.includes('dầu') && (p.skinType || '').toLowerCase().includes('dầu')) ||
              (lower.includes('chống nắng') && (p.name.toLowerCase().includes('chống nắng') || cat.includes('chống nắng'))) ||
              (lower.includes('serum') && p.name.toLowerCase().includes('serum'));
          }).slice(0, 3);
        }

        return res.status(200).json({
          success: true,
          provider: 'Google Gemini 3.8 Flash',
          reply: textReply,
          products: cardProducts.map(p => ({
            _id: p._id,
            name: p.name,
            brand: p.brand,
            category: p.category ? p.category.name : 'Mỹ phẩm',
            salePrice: p.salePrice,
            originalPrice: p.originalPrice,
            stock: p.stock,
            image: p.image,
            skinType: p.skinType,
            volume: p.volume,
            rating: p.rating
          })),
          suggestions: ['Tư vấn da dầu mụn', 'Kem chống nắng da nhạy cảm', 'Mã giảm giá hôm nay', 'Quy trình skincare tối']
        });
      } catch (geminiError) {
        console.warn('Google Gemini API bận/timeout -> Chuyển sang Blushé Smart AI Engine:', geminiError.message);
      }
    }

    // 5. Fallback thông minh: Blushé Smart AI Engine (100% thời gian hoạt động, bảo mật và chính xác)
    const fallbackResult = generateSmartFallbackReply({
      message: trimmedMsg,
      products,
      coupons,
      userOrderContext
    });

    return res.status(200).json({
      success: true,
      provider: fallbackResult.provider,
      reply: fallbackResult.reply,
      products: fallbackResult.products.map(p => ({
        _id: p._id,
        name: p.name,
        brand: p.brand,
        category: p.category ? p.category.name : 'Mỹ phẩm',
        salePrice: p.salePrice,
        originalPrice: p.originalPrice,
        stock: p.stock,
        image: p.image,
        skinType: p.skinType,
        volume: p.volume,
        rating: p.rating
      })),
      suggestions: fallbackResult.suggestions
    });
  } catch (error) {
    console.error('Lỗi controller AI:', error);
    return res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra khi xử lý tư vấn: ' + error.message
    });
  }
};
