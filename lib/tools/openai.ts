/**
 * Check if Whisper transcription is enabled
 */
function isWhisperEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Transcribe audio using OpenAI Whisper API
 * @param audioBuffer - Audio file buffer
 * @param filename - Original filename (e.g., "voice.ogg")
 * @returns Transcribed text
 */
async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(audioBuffer)]), filename);
  formData.append('model', 'whisper-1');

  const response: Response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const error: string = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const result: { text: string } = await response.json();
  return result.text;
}

export { isWhisperEnabled, transcribeAudio };
