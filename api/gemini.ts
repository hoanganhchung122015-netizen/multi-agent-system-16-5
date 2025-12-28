export const config = { runtime: 'edge' };

export default async function (req: Request) {
  try {
    // 1. Chỉ chấp nhận phương thức POST
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: "Chỉ chấp nhận phương thức POST" }), { status: 405 });
    }

    // 2. Lấy dữ liệu từ body và API Key
    const { subject, image, voiceText } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    // Kiểm tra API Key ngay lập tức
    if (!apiKey) {
      console.error("LỖI: Chưa cấu hình GEMINI_API_KEY trên Vercel!");
      return new Response(JSON.stringify({ error: "Server chưa cấu hình API Key" }), { status: 500 });
    }

    // 3. Xây dựng nội dung gửi tới Gemini
    const prompt = `Bạn là hệ thống giải bài tập SM-AS. 
    Hãy giải bài tập môn ${subject}. 
    YÊU CẦU BẮT BUỘC: Chỉ trả về JSON theo đúng cấu trúc sau, không kèm lời giải thích bên ngoài:
    {
      "solution": {
        "ans": "Đáp án cuối cùng (dùng Markdown/LaTeX nếu cần)",
        "steps": ["Bước giải 1", "Bước giải 2", "Bước giải 3"]
      },
      "quiz": {
        "q": "Một câu hỏi trắc nghiệm tương tự để luyện tập",
        "opt": ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"],
        "correct": 0,
        "reason": "Giải thích ngắn gọn tại sao chọn đáp án đó"
      }
    }
    Nội dung đề bài: ${voiceText || 'Đề bài nằm trong hình ảnh đi kèm'}`;

    const parts: any[] = [{ text: prompt }];
    
    // Kiểm tra và xử lý ảnh an toàn
    if (image && typeof image === 'string' && image.includes(',')) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: image.split(',')[1]
        }
      });
    }

    // 4. Gọi Google Gemini API với chế độ Stream (SSE)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.1 // Để kết quả ổn định, ít bị sáng tạo quá mức
          }
        })
      }
    );

    // 5. Kiểm tra phản hồi từ Google
    if (!response.ok) {
      const errorDetail = await response.text();
      console.error("Lỗi từ Google API:", errorDetail);
      return new Response(JSON.stringify({ error: "Google API phản hồi lỗi", details: errorDetail }), { status: response.status });
    }

    // 6. Trả về luồng dữ liệu (Stream) cho Frontend
    return new Response(response.body, {
      headers: { 
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (err: any) {
    console.error("Lỗi hệ thống tại API Gemini:", err.message);
    return new Response(JSON.stringify({ error: "Lỗi hệ thống", message: err.message }), { status: 500 });
  }
}
