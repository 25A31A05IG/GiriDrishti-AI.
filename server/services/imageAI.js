const axios = require("axios");

async function analyzeImage(imageBase64) {
  try {
    const response = await axios.post(
      `${process.env.ML_API}/image-predict`,
      {
        image: imageBase64,
      },
      {
        timeout: 30000,
      }
    );

    return response.data;
  } catch (error) {
    console.error("Image AI error:", error.message);

    return {
      probability: 0,
      riskScore: 0,
      riskLevel: "LOW",
      detected: false,
    };
  }
}

module.exports = {
  analyzeImage,
};