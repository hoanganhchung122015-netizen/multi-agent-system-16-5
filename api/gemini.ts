export const config = {
  runtime: 'edge', // Sử dụng Edge Runtime để tốc độ phản hồi nhanh nhất
};

export default async function handler(req: Request) {
  // 1. Chỉ cho phép phương thức POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 2. Lấy dữ liệu từ Frontend gửi lên
    const { subject, image, voiceText } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    // Kiểm tra API Key
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Server thiếu API Key. Hãy kiểm tra biến môi trường GEMINI_API_KEY." }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Xây dựng cấu trúc 'parts' cho Google API
    // Kết hợp cả văn bản (môn học, đề bài) và hình ảnh (nếu có)
    const promptText = `Bạn là chuyên gia giải bài tập của hệ thống SM-AS.
    Môn học: ${subject}.
    Yêu cầu: Giải chi tiết đề bài này và trả về kết quả dưới dạng JSON thuần túy.
    
    CẤU TRÚC JSON CẦN TRẢ VỀ:
    {
      "solution": {
        "ans": "Đáp án cuối cùng ngắn gọn",
        "steps": ["Bước giải 1...", "Bước giải 2...", "Bước giải 3..."]
      },
      "quiz": {
        "q": "Câu hỏi trắc nghiệm tương tự để luyện tập",
        "opt": ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"],
        "correct": 0,
        "reason": "Giải thích ngắn gọn lý do chọn đáp án đó"
      }
    }
    
    Nội dung bổ sung từ người dùng: ${voiceText || "Vui lòng xem trong hình ảnh đính kèm"}.`;

    const parts: any[] = [{ text: promptText }];

    // Xử lý hình ảnh (Base64) nếu có
    if (image && typeof image === 'string' && image.includes(',')) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: image.split(',')[1] // Lấy phần dữ liệu sau dấu phẩy
        }
      });
    }

    // 4. Gọi API Google Gemini với chế độ Stream (SSE)
    const googleResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1
          }
        })
      }
    );

    // 5. Kiểm tra lỗi từ phía Google
    if (!googleResponse.ok) {
      const errorData = await googleResponse.text();
      return new Response(JSON.stringify({ error: "Lỗi từ Google API", details: errorData }), { 
        status: googleResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 6. Trả về luồng dữ liệu (Stream) trực tiếp cho Frontend
    return new Response(googleResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (error: any) {
    // Xử lý các lỗi hệ thống khác
    return new Response(JSON.stringify({ error: "Lỗi Server Nội Bộ", message: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
