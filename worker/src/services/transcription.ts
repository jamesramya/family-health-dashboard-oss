export async function transcribeAudio(apiKey: string, audioBuffer: ArrayBuffer): Promise<string> {
  const params = new URLSearchParams({
    model: "nova-3",
    language: "multi",
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
  });

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "audio/webm",
    },
    body: audioBuffer,
  });

  if (!res.ok) {
    throw new Error(`Deepgram ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as {
    results: { channels: { alternatives: { transcript: string }[] }[] };
  };

  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (transcript === undefined || transcript === null) {
    throw new Error("Deepgram returned no transcript");
  }
  return transcript;
}
