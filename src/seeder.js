require("dotenv").config();

const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const Category = require("./models/Category");
const Product = require("./models/Product");
const User = require("./models/User");
const Brand = require("./models/Brand");
const Coupon = require("./models/Coupon");
const Review = require("./models/Review");

const seedData = async () => {
  try {
    // 1. Kết nối MongoDB Atlas
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Đã kết nối MongoDB Atlas thành công.");

    // 2. Tạo hoặc bảo toàn tài khoản quản trị và khách hàng
    console.log("👤 Đang đồng bộ tài khoản người dùng...");
    const existingAdmin = await User.findOne({ email: "admin@blushe.vn" });
    if (!existingAdmin) {
      await User.create({
        name: "Quản Trị Viên Blushé",
        email: "admin@blushe.vn",
        password: "admin123",
        phone: "0901234567",
        address: "Số 88 Đồng Khởi, Quận 1, TP. Hồ Chí Minh",
        role: "admin",
        isBlocked: false,
      });
      console.log("   + Đã tạo tài khoản Admin: admin@blushe.vn / admin123");
    }

    const existingCustomer = await User.findOne({
      email: "khachhang@gmail.com",
    });
    if (!existingCustomer) {
      await User.create({
        name: "Ngọc Lan (Khách Hàng Thân Thiết)",
        email: "khachhang@gmail.com",
        password: "123456",
        phone: "0987654321",
        address: "Căn hộ 12B, Landmark 81, Bình Thạnh, TP. Hồ Chí Minh",
        role: "customer",
        isBlocked: false,
      });
      console.log(
        "   + Đã tạo tài khoản Khách hàng: khachhang@gmail.com / 123456",
      );
    }

    // 3. Xóa dữ liệu cũ của danh mục, sản phẩm, thương hiệu để nạp chuẩn mới
    console.log(
      "🗑️ Đang làm mới dữ liệu danh mục, thương hiệu và sản phẩm mỹ phẩm...",
    );
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Brand.deleteMany({});
    await Coupon.deleteMany({});

    // 4. Nạp 8 Thương hiệu mỹ phẩm cao cấp
    const brandsData = [
      {
        name: "Blushé Naturals",
        slug: "blushe-naturals",
        origin: "Pháp",
        description:
          "Thương hiệu mỹ phẩm thuần chay hữu cơ cao cấp chuẩn Organic Beauty Châu Âu.",
        logo: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=200",
      },
      {
        name: "La Mer",
        slug: "la-mer",
        origin: "Mỹ",
        description:
          "Đẳng cấp chăm sóc da xa xỉ hàng đầu với tinh chất Miracle Broth phục hồi da thần kỳ.",
        logo: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=200",
      },
      {
        name: "Estée Lauder",
        slug: "estee-lauder",
        origin: "Mỹ",
        description:
          "Huyền thoại dưỡng da chống lão hóa và phục hồi ban đêm chuyên sâu toàn cầu.",
        logo: "https://images.unsplash.com/photo-1584949091598-c31daaaa4aa9?w=200",
      },
      {
        name: "SK-II",
        slug: "sk-ii",
        origin: "Nhật Bản",
        description:
          "Nước thần tinh chất Pitera dưỡng làn da trong suốt như pha lê.",
        logo: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=200",
      },
      {
        name: "Dior Beauty",
        slug: "dior-beauty",
        origin: "Pháp",
        description:
          "Sự kết hợp hoàn mỹ giữa thời trang Haute Couture và tinh hoa mỹ phẩm Paris.",
        logo: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=200",
      },
      {
        name: "Chanel",
        slug: "chanel",
        origin: "Pháp",
        description:
          "Biểu tượng nước hoa và mỹ phẩm sang trọng vượt thời gian.",
        logo: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=200",
      },
      {
        name: "Sulwhasoo",
        slug: "sulwhasoo",
        origin: "Hàn Quốc",
        description:
          "Mỹ phẩm thảo dược Hoàng cung tái sinh thanh xuân cho làn da.",
        logo: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=200",
      },
      {
        name: "Kiehl's",
        slug: "kiehls",
        origin: "Mỹ",
        description:
          "Dược mỹ phẩm lâu đời từ năm 1851 chăm sóc và phục hồi hàng rào bảo vệ da.",
        logo: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=200",
      },
    ];
    await Brand.insertMany(brandsData);
    console.log("✅ Đã tạo 8 thương hiệu mỹ phẩm.");

    // 5. Nạp 11 Danh mục mỹ phẩm theo đúng yêu cầu đề bài
    const categoriesData = [
      {
        name: "Sữa rửa mặt",
        slug: "sua-rua-mat",
        description: "Làm sạch sâu, dịu nhẹ và cân bằng độ pH tự nhiên cho da.",
        image:
          "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600",
      },
      {
        name: "Toner",
        slug: "toner",
        description: "Cân bằng độ ẩm, se khít lỗ chân lông và làm dịu tức thì.",
        image:
          "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600",
      },
      {
        name: "Serum",
        slug: "serum",
        description: "Tinh chất phục hồi, sáng da, chống lão hóa chuyên sâu.",
        image:
          "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600",
      },
      {
        name: "Kem dưỡng",
        slug: "kem-duong",
        description:
          "Khóa ẩm, phục hồi màng ẩm sinh học và nuôi dưỡng tế bào da.",
        image:
          "https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?w=600",
      },
      {
        name: "Kem chống nắng",
        slug: "kem-chong-nang",
        description: "Bảo vệ quang phổ rộng chống UVA, UVB và ánh sáng xanh.",
        image:
          "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600",
      },
      {
        name: "Mặt nạ",
        slug: "mat-na",
        description: "Thư giãn, cấp nước đa tầng và tái tạo da rạng rỡ.",
        image:
          "https://images.unsplash.com/photo-1567928815104-b6a37e8c3fec?w=600",
      },
      {
        name: "Tẩy trang",
        slug: "tay-trang",
        description: "Làm sạch lớp trang điểm cứng đầu và bụi mịn êm dịu.",
        image:
          "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600",
      },
      {
        name: "Son môi",
        slug: "son-moi",
        description:
          "Sắc màu thời thượng, dưỡng ẩm căng mọng mềm mại suốt ngày dài.",
        image:
          "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600",
      },
      {
        name: "Trang điểm",
        slug: "trang-diem",
        description:
          "Phấn phủ, kem nền che khuyết điểm mang lại lớp nền hoàn hảo.",
        image:
          "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600",
      },
      {
        name: "Nước hoa",
        slug: "nuoc-hoa",
        description: "Hương thơm sang trọng, quý phái lưu hương bền bỉ.",
        image:
          "https://images.unsplash.com/photo-1541643600914-78b084683601?w=600",
      },
      {
        name: "Bộ sản phẩm chăm sóc da",
        slug: "bo-san-pham-cham-soc-da",
        description:
          "Quy trình dưỡng da toàn diện tối ưu hiệu quả và tiết kiệm.",
        image:
          "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600",
      },
    ];

    const createdCats = await Category.insertMany(categoriesData);
    console.log("✅ Đã tạo 11 danh mục mỹ phẩm chuẩn.");

    const catMap = {};
    createdCats.forEach((c) => {
      catMap[c.slug] = c._id;
    });

    // 6. Nạp danh sách sản phẩm mỹ phẩm phong phú, thực tế với thông tin chi tiết
    const productsData = [
      {
        name: "Sữa Rửa Mặt Hữu Cơ Blushé Gentle Botanical Cleanser",
        category: catMap["sua-rua-mat"],
        brand: "Blushé Naturals",
        originalPrice: 450000,
        salePrice: 380000,
        stock: 45,
        image:
          "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600",
        description:
          "Gel rửa mặt chiết xuất trà xanh và hoa cúc La Mã hữu cơ làm sạch êm dịu, không gây căng rát, giữ trọn độ ẩm tự nhiên.",
        ingredients:
          "Trà xanh hữu cơ, Cúc La Mã, Rau má, Niacinamide 2%, Glycerin thực vật.",
        usage:
          "Làm ướt mặt, lấy một lượng vừa đủ xoa đều tạo bọt mịn, massage nhẹ nhàng 60 giây rồi rửa lại với nước ấm.",
        skinType: "Mọi loại da, Da nhạy cảm",
        volume: "150ml",
        origin: "Pháp",
        rating: 4.9,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
      },
      {
        name: "Nước Hoa Hồng Cánh Hoa Cúc Kiehl's Calendula Herbal-Extract",
        category: catMap["toner"],
        brand: "Kiehl's",
        originalPrice: 1250000,
        salePrice: 1050000,
        stock: 32,
        image:
          "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600",
        description:
          "Toner hoa cúc huyền thoại chứa từng cánh hoa thật được hái bằng tay, làm dịu da tức thì, kiểm soát bã nhờn hiệu quả.",
        ingredients:
          "Cánh hoa cúc Calendula, Allantoin, Chiết xuất rễ ngưu bàng, Tinh chất thường xuân.",
        usage:
          "Sau bước rửa mặt, thấm toner vào bông cotton thoa đều khắp mặt hoặc vỗ nhẹ bằng lòng bàn tay.",
        skinType: "Da dầu, Da hỗn hợp thiên dầu",
        volume: "250ml",
        origin: "Mỹ",
        rating: 4.9,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
      },
      {
        name: "Serum Estée Lauder Advanced Night Repair Synchronized Multi-Recovery",
        category: catMap["serum"],
        brand: "Estée Lauder",
        originalPrice: 4200000,
        salePrice: 3450000,
        stock: 28,
        image:
          "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600",
        description:
          "Tinh chất phục hồi ban đêm số 1 thế giới với công nghệ ChronoluxCB độc quyền giúp tái sinh collagen, mờ nếp nhăn và căng mọng.",
        ingredients:
          "Bifida Ferment Lysate, Tripeptide-32, Hyaluronic Acid nồng độ cao, Chiết xuất men bia.",
        usage:
          "Nhỏ 4-5 giọt ra lòng bàn tay, làm ấm rồi áp nhẹ lên mặt và cổ, dùng mỗi buổi tối trước bước kem dưỡng.",
        skinType: "Mọi loại da, Da lão hóa, Da thiếu ẩm",
        volume: "50ml",
        origin: "Mỹ",
        rating: 5.0,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
      },
      {
        name: "Kem Dưỡng Ẩm Phục Hồi Thần Kỳ La Mer Crème de la Mer",
        category: catMap["kem-duong"],
        brand: "La Mer",
        originalPrice: 6800000,
        salePrice: 5990000,
        stock: 18,
        image:
          "https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?w=600",
        description:
          "Kem dưỡng ẩm xa xỉ biểu tượng mang lại khả năng làm lành da diệu kỳ, làm dịu các nốt đỏ và chống lão hóa tối ưu.",
        ingredients:
          "Miracle Broth™ (tảo bẹ biển lên men), Tinh dầu lá khuynh diệp, Chiết xuất trà chanh, Vitamin C & E.",
        usage:
          "Lấy một lượng nhỏ làm ấm giữa các đầu ngón tay cho đến khi chất kem chuyển trong suốt rồi áp nhẹ lên da.",
        skinType: "Da khô, Da nhạy cảm, Da treatment",
        volume: "60ml",
        origin: "Mỹ",
        rating: 5.0,
        isFeatured: true,
        isBestSeller: false,
        isNewArrival: false,
      },
      {
        name: "Kem Chống Nắng Phổ Rộng Blushé Invisible Sun Shield SPF50+ PA++++",
        category: catMap["kem-chong-nang"],
        brand: "Blushé Naturals",
        originalPrice: 590000,
        salePrice: 490000,
        stock: 60,
        image:
          "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600",
        description:
          "Kem chống nắng kết cấu siêu nhẹ tệp da tự nhiên, không vón cục, kiềm dầu và nâng tone trắng hồng rạng rỡ.",
        ingredients:
          "Zinc Oxide, Tinosorb S, Chiết xuất ngọc trai, Hyaluronic Acid phân tử nhỏ, Tinh chất trà xanh.",
        usage:
          "Thoa đều lên da trước khi ra ngoài 20 phút. Thoa lại sau mỗi 3-4 giờ nếu tiếp xúc liên tục dưới nắng.",
        skinType: "Mọi loại da, Da dầu mụn",
        volume: "50ml",
        origin: "Pháp",
        rating: 4.8,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: true,
      },
      {
        name: "Mặt Nạ Dưỡng Da Sinh Học Thảo Dược Sulwhasoo First Care",
        category: catMap["mat-na"],
        brand: "Sulwhasoo",
        originalPrice: 850000,
        salePrice: 690000,
        stock: 35,
        image:
          "https://images.unsplash.com/photo-1567928815104-b6a37e8c3fec?w=600",
        description:
          "Mặt nạ sợi vi sinh lên men ngậm trọn hợp chất JAUM Balancing Complex™ giúp da săn chắc, rạng ngời chỉ sau 15 phút.",
        ingredients:
          "Hợp chất ngũ vị tử và sâm quý JAUM, Rễ địa hoàng, Hoa mẫu đơn trắng, Mật ong rừng.",
        usage:
          "Đắp mặt nạ ôm sát khuôn mặt trong 15-20 phút, gỡ bỏ và vỗ nhẹ tinh chất còn lại thẩm thấu sâu vào da.",
        skinType: "Da mệt mỏi, Da xỉn màu, Da thiếu sức sống",
        volume: "Hộp 5 miếng",
        origin: "Hàn Quốc",
        rating: 4.9,
        isFeatured: false,
        isBestSeller: false,
        isNewArrival: true,
      },
      {
        name: "Nước Tẩy Trang Cấp Ẩm Dịu Nhẹ Blushé Micellar Cleansing Water",
        category: catMap["tay-trang"],
        brand: "Blushé Naturals",
        originalPrice: 420000,
        salePrice: 350000,
        stock: 50,
        image:
          "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600",
        description:
          "Công nghệ phân tử Micellar hút sạch cặn trang điểm và bụi mịn PM2.5 mà vẫn giữ màng ẩm mịn màng cho da.",
        ingredients:
          "Nước khoáng núi lửa Pháp, Hoa oải hương hữu cơ, Panthenol (Vitamin B5), Chiết xuất nha đam.",
        usage:
          "Thấm ướt bông tẩy trang và nhẹ nhàng lau sạch vùng mặt, mắt và môi. Không cần rửa lại với nước.",
        skinType: "Mọi loại da, Kể cả da mắt môi nhạy cảm",
        volume: "300ml",
        origin: "Pháp",
        rating: 4.8,
        isFeatured: false,
        isBestSeller: false,
        isNewArrival: true,
      },
      {
        name: "Son Dưỡng Dior Addict Lip Glow Color Awakening Hydrating Lip Balm",
        category: catMap["son-moi"],
        brand: "Dior Beauty",
        originalPrice: 1200000,
        salePrice: 990000,
        stock: 55,
        image:
          "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600",
        description:
          "Cây son dưỡng công chúa huyền thoại phản ứng theo độ pH của môi để tạo ra sắc hồng tự nhiên và độ ẩm kéo dài 24 giờ.",
        ingredients:
          "Bơ hạt xoài, Tinh dầu hoa anh đào, Sáp ong tự nhiên, Tinh chất hoa sen tuyết.",
        usage:
          "Thoa trực tiếp lên môi một mình để có sắc hồng nhẹ nhàng hoặc dùng làm lót trước khi đánh son lì.",
        skinType: "Mọi sắc môi, Môi khô nứt nẻ",
        volume: "3.5g",
        origin: "Pháp",
        rating: 4.9,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
      },
      {
        name: "Phấn Nước Cao Cấp Dior Forever Skin Glow Cushion",
        category: catMap["trang-diem"],
        brand: "Dior Beauty",
        originalPrice: 1950000,
        salePrice: 1720000,
        stock: 22,
        image:
          "https://product.hstatic.net/1000328823/product/thiet_ke_chua_co_ten__4__ff8e1732cd954e3ba400a4bd2ec6e790.png",
        description:
          "Phấn nước cushion với độ che phủ tinh tế, mang lại lớp nền căng bóng sang trọng chuẩn Parisian glow suốt 24 giờ.",
        ingredients:
          "Chiết xuất hoa păng-xê, Tinh chất tầm xuân, Khoáng chất phản chiếu ánh sáng.",
        usage:
          "Dùng bông mút ấn nhẹ lấy lượng vừa đủ rồi dặm đều từ trung tâm khuôn mặt ra ngoài.",
        skinType: "Da thường, Da hỗn hợp, Da khô",
        volume: "14g",
        origin: "Pháp",
        rating: 4.9,
        isFeatured: true,
        isBestSeller: false,
        isNewArrival: true,
      },
      {
        name: "Nước Hoa Nữ Chanel N°5 Eau De Parfum Huyền Thoại",
        category: catMap["nuoc-hoa"],
        brand: "Chanel",
        originalPrice: 4500000,
        salePrice: 3990000,
        stock: 20,
        image:
          "https://images.unsplash.com/photo-1541643600914-78b084683601?w=600",
        description:
          "Hương hoa cỏ An-đê-hít sang trọng bất hủ, thể hiện sự quyến rũ, thanh lịch và đẳng cấp tối thượng của người phụ nữ.",
        ingredients:
          "Hoa hồng Tháng Năm Grasse, Hoa nhài xứ Grasse, Hoa ngọc lan tây, Xạ hương và Gỗ đàn hương.",
        usage:
          "Xịt lên các điểm mạch như cổ tay, sau gáy, ngực để hương thơm lan tỏa quyến rũ suốt ngày dài.",
        skinType: "Phù hợp mọi quý cô thanh lịch",
        volume: "100ml",
        origin: "Pháp",
        rating: 5.0,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
      },
      {
        name: "Bộ Chăm Sóc Da Hoàng Gia Blushé Luxury Radiance Routine 4 Món",
        category: catMap["bo-san-pham-cham-soc-da"],
        brand: "Blushé Naturals",
        originalPrice: 2800000,
        salePrice: 2190000,
        stock: 25,
        image:
          "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600",
        description:
          "Quy trình dưỡng sáng mờ thâm toàn diện 4 bước gồm Sữa rửa mặt, Toner hoa hồng hữu cơ, Serum Vitamin C và Kem dưỡng tế bào gốc.",
        ingredients:
          "Vitamin C 15%, Arbutin, Niacinamide, Tế bào gốc táo Thụy Sĩ, Nước hoa hồng chưng cất.",
        usage:
          "Thực hiện theo thứ tự: Sữa rửa mặt -> Nước hoa hồng -> Serum dưỡng sâu -> Kem dưỡng khóa ẩm.",
        skinType: "Mọi loại da, Da xỉn màu nám sạm",
        volume: "Bộ 4 món full size",
        origin: "Pháp",
        rating: 5.0,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: true,
      },
      {
        name: "Nước Thần Tinh Chất Dưỡng Da Pha Lê SK-II Facial Treatment Essence",
        category: catMap["serum"],
        brand: "SK-II",
        originalPrice: 5200000,
        salePrice: 4590000,
        stock: 24,
        image:
          "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600",
        description:
          "Chứa hơn 90% thành phần Pitera tự nhiên mang lại làn da trong suốt, mờ đốm nâu và tái định hình cấu trúc da kỳ diệu.",
        ingredients:
          "Pitera™ độc quyền từ men sake rượu sake Nhật, Axit amin, Khoáng chất tự nhiên.",
        usage:
          "Thấm vào miếng bông hoặc nhỏ trực tiếp ra tay, vỗ nhẹ đều khắp mặt trong 1 phút.",
        skinType: "Mọi loại da, Da dầu thiếu nước",
        volume: "230ml",
        origin: "Nhật Bản",
        rating: 4.9,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
      },
      {
        name: "Mặt Nạ Tràm Trà Trà Xanh Dịu Da Blushé Organic Sheet Mask",
        category: catMap["mat-na"],
        brand: "Blushé Naturals",
        originalPrice: 220000,
        salePrice: 180000,
        stock: 80,
        image:
          "https://img.onelife.vn/9mttEZ-ofk8g0uyb71fC0Eh2XcrAjB_0X9DI82cZ1GI/rs:fit:1350:1695:1/aHR0cHM6Ly9zdGF0aWMuanVuby52bi9jbXNpbWFnZS9wdWJsaWMvbWFjLWRpbmhfbW4wMjRfMV8yMDI2MDQxNDE4MTQ1MC5qcGVn.webp",
        description:
          "Mặt nạ sợi dệt sinh học chiết xuất tràm trà và trà xanh hữu cơ làm dịu mẩn đỏ, kiểm soát dầu thừa tức thì.",
        ingredients:
          "Chiết xuất Tràm trà (Tea Tree), Rau má Centella, Trà xanh hữu cơ, Hyaluronic Acid.",
        usage:
          "Đắp mặt nạ từ 15-20 phút sau bước toner, vỗ nhẹ cho tinh chất thẩm thấu không cần rửa lại.",
        skinType: "Da dầu mụn, Da nhạy cảm mẩn đỏ",
        volume: "25ml x 5 miếng",
        origin: "Hàn Quốc",
        rating: 4.9,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: true,
      },
      {
        name: "Son Dưỡng Hữu Cơ Dầu Hạt Mỡ Blushé Organic Lip Balm",
        category: catMap["son-moi"],
        brand: "Blushé Naturals",
        originalPrice: 290000,
        salePrice: 240000,
        stock: 70,
        image:
          "https://images.unsplash.com/photo-1599305090598-fe179d501227?w=600",
        description:
          "Son dưỡng mềm môi hữu cơ không màu, cấp ẩm sâu từ bơ hạt mỡ và dầu dừa nguyên chất.",
        ingredients:
          "Bơ hạt mỡ hữu cơ, Sáp ong tự nhiên, Dầu jojoba, Dầu dừa ép lạnh, Vitamin E.",
        usage:
          "Thoa đều lên môi bất cứ khi nào cảm thấy khô, hoặc thoa lớp dày làm mặt nạ ngủ cho môi.",
        skinType: "Mọi loại da môi, Môi khô nứt nẻ",
        volume: "4.5g",
        origin: "Pháp",
        rating: 4.8,
        isFeatured: false,
        isBestSeller: true,
        isNewArrival: true,
      },
    ];

    await Product.insertMany(productsData);
    console.log("✅ Đã tạo 14 sản phẩm mỹ phẩm cao cấp chi tiết.");

    // 7. Nạp 4 Mã giảm giá
    const couponsData = [
      {
        code: "BLUSHE10",
        description: "Ưu đãi 10% cho thành viên mới của Blushé Beauty",
        discountType: "PERCENT",
        discountValue: 10,
        minOrderValue: 0,
        maxDiscountAmount: 200000,
        isActive: true,
        expiryDate: new Date("2027-12-31"),
      },
      {
        code: "NANGNIU50",
        description: "Giảm trực tiếp 50.000đ cho đơn hàng mỹ phẩm từ 500.000đ",
        discountType: "FIXED",
        discountValue: 50000,
        minOrderValue: 500000,
        maxDiscountAmount: 50000,
        isActive: true,
        expiryDate: new Date("2027-12-31"),
      },
      {
        code: "ORGANIC20",
        description: "Giảm 20% cho đơn hàng chăm sóc da cao cấp từ 1.000.000đ",
        discountType: "PERCENT",
        discountValue: 20,
        minOrderValue: 1000000,
        maxDiscountAmount: 500000,
        isActive: true,
        expiryDate: new Date("2027-12-31"),
      },
      {
        code: "FREESHIP",
        description:
          "Hỗ trợ 25.000đ phí vận chuyển toàn quốc cho đơn từ 300.000đ",
        discountType: "FIXED",
        discountValue: 25000,
        minOrderValue: 300000,
        maxDiscountAmount: 25000,
        isActive: true,
        expiryDate: new Date("2027-12-31"),
      },
    ];
    await Coupon.insertMany(couponsData);
    console.log("✅ Đã tạo 4 mã giảm giá.");

    console.log("🎉 Hoàn tất nạp dữ liệu E-Commerce mỹ phẩm Blushé Beauty!");
  } catch (error) {
    console.error("❌ Lỗi khi nạp dữ liệu:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Đã ngắt kết nối an toàn với MongoDB.");
  }
};

seedData();
