export const config = { runtime: 'edge' };

export default async function (req: Request) {
  try {
    const { subject, image, voiceText } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    // Prompt "Siêu Sạch" ép AI trả về JSON cấu trúc cứng
    const prompt = `Bạn là hệ thống SM-AS. Chỉ trả về JSON, không chào hỏi.
    {
      "solution": {
        "ans": "Đáp án Markdown (dùng LaTeX $...$)",
        "steps": ["Bước 1 ngắn gọn", "Bước 2 ngắn gọn", "Bước 3 ngắn gọn"]
      },
      "quiz": {
        "q": "Câu hỏi tương tự?",
        "opt": ["A", "B", "C", "D"],
        "correct": 0,
        "reason": "Giải thích ngắn"
      }
    }
    Môn: ${subject}. Đề bài: ${voiceText || 'Giải bài trong ảnh'}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              ...(image ? [{ inlineData: { mimeType: "image/jpeg", data: image.split(",")[1] } }] : [])
            ]
          }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
        })
      }
    );

    return new Response(response.body, {
      headers: { "Content-Type": "text/event-stream" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Lỗi Server" }), { status: 500 });
  }
}

