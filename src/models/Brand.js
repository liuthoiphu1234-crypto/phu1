const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên thương hiệu không được để trống'],
      trim: true,
      unique: true
    },
    slug: {
      type: String,
      lowercase: true,
      trim: true
    },
    origin: {
      type: String,
      default: 'Pháp',
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    logo: {
      type: String,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Brand', brandSchema);
