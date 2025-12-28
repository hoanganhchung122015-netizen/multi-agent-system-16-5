// --- File: api/gemini.ts ---
export const config = {
  runtime: 'edge',
};

export default async function (req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // 1. Lấy Google API Key từ biến môi trường
  const apiKey = process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Thiếu Gemini API Key' }), { status: 500 });
  }

  try {
    const { subject, prompt, image } = await req.json();

    // 2. Cấu trúc lại dữ liệu gửi sang Google Gemini API
    const contents = [
      {
        parts: [
          { text: `Bạn là giáo viên chuyên nghiệp. Trả về JSON chính xác cấu trúc này: { "speed": { "answer": "đáp án", "similar": { "question": "câu hỏi", "options": ["A", "B", "C", "D"], "correctIndex": 0 } }, "socratic_hint": "gợi ý", "core_concept": "khái niệm" }. Môn ${subject}: ${prompt}` },
          // Nếu có ảnh (Base64), thêm vào để Gemini quét
          ...(image ? [{
            inlineData: {
              mimeType: "image/jpeg",
              data: image.includes(",") ? image.split(",")[1] : image
            }
          }] : [])
        ]
      }
    ];

    // 3. Gọi API của Google Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      })
    });

    const data = await response.json();

    // 4. Lấy nội dung text từ phản hồi của Gemini
    if (!data.candidates || !data.candidates[0]) {
       return new Response(JSON.stringify({ error: 'Không nhận được phản hồi từ AI' }), { status: 500 });
    }

    const content = data.candidates[0].content.parts[0].text;
    
    return new Response(content, {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error("Lỗi Server:", err);
    return new Response(JSON.stringify({ error: 'Lỗi máy chủ khi xử lý Gemini' }), { status: 500 });
  }
}