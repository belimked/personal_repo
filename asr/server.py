"""小禾 转写服务（63，FunASR CPU）。

GET  /health      -> {ok, model, busy, version}
POST /transcribe  -> 头 X-ASR-Token；multipart 字段 file
                  -> {duration_s, elapsed_s, text, speakers, segments:[{start_ms,end_ms,speaker,text}]}
同一时间只处理一个请求，正忙返回 503 busy。
"""
import hmac
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
import wave

os.environ.setdefault("MODELSCOPE_CACHE", r"F:\asr\model-cache")

import uvicorn
from fastapi import FastAPI, File, Header, Request, UploadFile
from fastapi.responses import JSONResponse
from funasr import AutoModel

VERSION = "1.0.1"
MODEL_DESC = "paraformer-zh+fsmn-vad+ct-punc+cam++"
HOST = os.environ.get("ASR_HOST", "0.0.0.0")
PORT = int(os.environ.get("ASR_PORT", "11226"))
TOKEN = os.environ.get("ASR_TOKEN", "")
FFMPEG = os.environ.get("ASR_FFMPEG", r"F:\ffmpeg-master-latest-win64-gpl-shared\bin\ffmpeg.exe")
TMP_DIR = os.environ.get("ASR_TMP", r"F:\asr\service\tmp")
MAX_BYTES = 100 * 1024 * 1024
# 63 的 Windows 防火墙整体关闭，防火墙规则不生效，在程序里限制来源
ALLOW = {a.strip() for a in os.environ.get("ASR_ALLOW", "10.3.19.65,127.0.0.1").split(",") if a.strip()}

if not TOKEN:
    raise SystemExit("ASR_TOKEN 未设置")
os.makedirs(TMP_DIR, exist_ok=True)
# 上次异常退出留下的临时文件
for name in os.listdir(TMP_DIR):
    shutil.rmtree(os.path.join(TMP_DIR, name), ignore_errors=True)

print("loading model", flush=True)
MODEL = AutoModel(
    model="paraformer-zh",
    vad_model="fsmn-vad",
    punc_model="ct-punc",
    spk_model="cam++",
    device="cpu",
    disable_update=True,
)
print("model loaded", flush=True)

LOCK = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def only_allowed(request: Request, call_next):
    if not request.client or request.client.host not in ALLOW:
        return JSONResponse({"error": "forbidden", "message": "不允许的来源"}, status_code=403)
    return await call_next(request)


def err(status, code, message):
    return JSONResponse({"error": code, "message": message}, status_code=status)


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_DESC, "busy": LOCK.locked(), "version": VERSION}


@app.post("/transcribe")
def transcribe(file: UploadFile = File(...), x_asr_token: str = Header(default="")):
    if not hmac.compare_digest(x_asr_token.encode(), TOKEN.encode()):
        return err(401, "unauthorized", "转写服务密钥不正确")
    if not LOCK.acquire(blocking=False):
        return err(503, "busy", "转写服务正忙")
    work = os.path.join(TMP_DIR, uuid.uuid4().hex)
    try:
        os.makedirs(work)
        src = os.path.join(work, "input")
        size = 0
        with open(src, "wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    return err(413, "too_large", "音频文件超过 100 MB")
                out.write(chunk)
        if size == 0:
            return err(400, "empty_file", "音频文件为空")

        wav = os.path.join(work, "audio.wav")
        p = subprocess.run(
            [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", src,
             "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", wav],
            capture_output=True, timeout=600,
        )
        if p.returncode != 0 or not os.path.exists(wav):
            return err(400, "bad_audio", "无法识别的音频格式或文件已损坏")
        with wave.open(wav, "rb") as f:
            duration = f.getnframes() / f.getframerate()
        if duration < 0.5:
            return err(400, "too_short", "录音太短")

        t = time.perf_counter()
        result = MODEL.generate(input=wav, batch_size_s=300, return_spk_res=True)
        elapsed = time.perf_counter() - t

        r = result[0] if result else {}
        segments = [
            {
                "start_ms": int(s.get("start", 0)),
                "end_ms": int(s.get("end", 0)),
                "speaker": int(s.get("spk", 0)),
                "text": s.get("text", ""),
            }
            for s in r.get("sentence_info", []) or []
        ]
        return {
            "duration_s": round(duration, 3),
            "elapsed_s": round(elapsed, 3),
            "text": r.get("text", ""),
            "speakers": len({s["speaker"] for s in segments}),
            "segments": segments,
            "model": MODEL_DESC,
        }
    except subprocess.TimeoutExpired:
        return err(500, "convert_timeout", "音频转码超时")
    except Exception as e:  # noqa: BLE001
        print("transcribe error:", repr(e), flush=True)
        return err(500, "asr_failed", "转写失败")
    finally:
        file.file.close()
        shutil.rmtree(work, ignore_errors=True)
        LOCK.release()


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info", access_log=False)
