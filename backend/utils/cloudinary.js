const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadBase64 = async (base64String, folderName = 'coaching_app') => {
  if (!base64String) return null;
  
  try {
    // If string doesn't have data:image block, we might not be able to upload directly, 
    // but expo-image-picker usually returns data URI if configured, or base64 separately.
    // We expect the frontend to send the prefix, e.g. "data:image/jpeg;base64,..."
    // If not, we prepend it.
    let uploadStr = base64String;
    if (!uploadStr.startsWith('data:image')) {
       // default to jpeg
       uploadStr = `data:image/jpeg;base64,${base64String}`;
    }

    const result = await cloudinary.uploader.upload(uploadStr, {
      folder: folderName,
    });
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

module.exports = { cloudinary, uploadBase64 };
