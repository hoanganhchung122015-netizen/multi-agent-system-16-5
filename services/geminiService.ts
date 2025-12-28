export const optimizeImage = async (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const MAX = 1024; // Độ phân giải chuẩn cho AI đọc
      let w = img.width, h = img.height;
      if (w > MAX) { h = (h * MAX) / w; w = MAX; }
      canvas.width = w; canvas.height = h;
      ctx?.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.6)); // Nén 60%
    };
  });
};

export const callSMASStream = async (subject: string, image?: string, voiceText?: string) => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, image, voiceText }),
  });
  if (!response.ok) throw new Error('Kết nối thất bại');
  return response.body; // Trả về ReadableStream
};
