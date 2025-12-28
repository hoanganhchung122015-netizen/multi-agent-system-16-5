import { GoogleGenAI } from "@google/genai";
import { Subject, AgentType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || "" });
const MODEL_NAME = "gemini-1.5-flash";

// --- 1. XỬ LÝ ẢNH (Resize & Nén) ---
export const optimizeImage = async (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1024; // Đảm bảo AI đọc rõ chữ nhưng file nhẹ
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6)); // Nén 60%
    };
  });
};

// --- 2. CHUẨN HÓA LATEX ---
const formatLatex = (text: string) => {
  return text
    .replace(/\\\(|\\\)/g, "$") 
    .replace(/\\\[|\\\]/g, "$$")
    .trim();
};

// --- 3. HỆ THỐNG CHỈ THỊ (PROMPTS) ---
const AGENT_PROMPTS = {
  [AgentType.SPEED]: "Bạn là Chuyên gia giải nhanh. Hãy đưa ra ĐÁP ÁN CUỐI CÙNG và CÁC BƯỚC BẤM MÁY CASIO (nếu có). Ngắn gọn, súc tích. Dùng LaTeX.",
  [AgentType.SOCRATIC]: "Bạn là Giáo sư Sư phạm. Hãy giải thích mấu chốt vấn đề, các bước giải logic và công thức áp dụng. Giải sâu sắc nhưng dễ hiểu. Dùng LaTeX.",
  [AgentType.PERPLEXITY]: "Bạn là Chuyên gia luyện tập. Hãy đưa ra 2 bài tập tương tự kèm đáp án để học sinh tự luyện. Dùng LaTeX."
};

// --- 4. HÀM XỬ LÝ CHÍNH CHO TỪNG AGENT ---
export const callAgent = async (agent: AgentType, subject: Subject, input: string, image?: string) => {
  const model = ai.getGenerativeModel({ model: MODEL_NAME });
  
  const prompt = `Môn: ${subject}. Nhiệm vụ: ${AGENT_PROMPTS[agent]}. Đề bài: ${input}`;
  const parts: any[] = [{ text: prompt }];

  if (image) {
    parts.unshift({
      inlineData: { mimeType: "image/jpeg", data: image.split(",")[1] }
    });
  }

  const result = await model.generateContent({ contents: [{ role: "user", parts }] });
  return formatLatex(result.response.text());
};

// --- 5. HÀM TÓM TẮT MẤU CHỐT (Cho nút Loa) ---
export const getBriefSummary = async (fullAnswer: string) => {
  const model = ai.getGenerativeModel({ model: MODEL_NAME });
  const prompt = `Tóm tắt mấu chốt bài giải sau trong DUY NHẤT 1 CÂU (tối đa 20 từ) để đọc cho học sinh nghe: ${fullAnswer}`;
  const result = await model.generateContent(prompt);
  return result.response.text();
};
