import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

// ==========================================
// AudioMuxService — fallback B из ТЗ (Seedance без audio-референса + Fish TTS + ffmpeg)
// ==========================================
// Путь A (Seedance принимает audio-референс через input_references) даёт
// синхронизированную озвучку «изнутри» модели. Если провайдер job
// отклонил — например, конкретная модель/тариф на стороне OpenRouter не
// поддерживает аудио-референс для данного запроса — используется этот
// сервис: берём УЖЕ готовое видео (со своей сгенерированной звуковой
// дорожкой) и ПОЛНОСТЬЮ заменяем звук на голос Fish. Точной синхронизации
// губ по этому пути не будет — честно показываем это в UI (см. video.service.ts).
//
// Требование инфраструктуры: на сервере должен быть установлен ffmpeg
// (`apt install -y ffmpeg`), это НЕ npm-зависимость — здесь просто
// оборачивается системный бинарник. Если ffmpeg не найден в PATH,
// child_process упадёт с ENOENT — это перехватывается и превращается в
// понятную ошибку, а не «зависшую» генерацию.
@Injectable()
export class AudioMuxService {
  private readonly timeoutMs = 60_000;

  // videoBuf — уже скачанный готовый ролик (обычно mp4 от Seedance).
  // audioBuf/audioMime — голос Fish (mp3 из TTS или wav из Voice Design).
  // -shortest — обрезает результат по более короткой дорожке (обычно это
  // видео: если реплика длиннее клипа, лишний хвост голоса просто не
  // нужен пользователю — целостность видео важнее полной фразы).
  async replaceAudio(videoBuf: Buffer, audioBuf: Buffer, audioMime: string): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'void-video-dub-'));
    const videoExt = 'mp4';
    const audioExt = audioMime.includes('wav') ? 'wav' : 'mp3';
    const videoPath = join(dir, `in.${videoExt}`);
    const audioPath = join(dir, `voice.${audioExt}`);
    const outPath = join(dir, `out.${videoExt}`);
    try {
      await Promise.all([
        writeFile(videoPath, videoBuf),
        writeFile(audioPath, audioBuf),
      ]);
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', videoPath,
        '-i', audioPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        outPath,
      ], { timeout: this.timeoutMs });
      return await readFile(outPath);
    } catch (e: any) {
      if (e?.code === 'ENOENT') {
        console.error('[AudioMuxService] ffmpeg не найден в PATH на сервере — установите: apt install -y ffmpeg');
        throw new ServiceUnavailableException('Наложение озвучки недоступно: ffmpeg не установлен на сервере');
      }
      console.error('[AudioMuxService] ffmpeg завершился с ошибкой:', e?.stderr?.toString?.().slice(0, 800) || e?.message || e);
      throw new ServiceUnavailableException('Не удалось наложить озвучку на готовое видео');
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
