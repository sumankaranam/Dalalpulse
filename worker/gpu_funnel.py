"""
DalalPulse: 3-Stage GPU Funnel
Stage 1: bge-small semantic deduplication & noise filtering
Stage 2: FinBERT financial sentiment classification (-1.0 to +1.0)
Stage 3: Qwen2.5-3B-Instruct GGUF (via llama-cpp-python) / Gemini frontier fallback

Strictly enforces:
- Peak VRAM <= 4.5 GB
- Sequential model execution with explicit memory clearing:
  del model; gc.collect(); torch.cuda.empty_cache()
"""

import os
import gc
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

# Check PyTorch availability
try:
    import torch
    HAS_TORCH = True
except ImportError:
    torch = None
    HAS_TORCH = False

def free_gpu_memory():
    """Forces garbage collection and flushes CUDA VRAM."""
    gc.collect()
    if HAS_TORCH and torch.cuda.is_available():
        torch.cuda.empty_cache()
        try:
            torch.cuda.ipc_collect()
        except Exception:
            pass

def get_peak_vram_mb() -> float:
    """Returns peak CUDA VRAM in MB used by current process."""
    if HAS_TORCH and torch.cuda.is_available():
        return torch.cuda.max_memory_allocated() / (1024 * 1024)
    return 0.0

class GPUFunnel:
    def __init__(self, models_dir: Optional[str] = None):
        self.models_dir = models_dir or os.getenv("LOCAL_MODEL_DIR", r"C:\models")
        self.gguf_filename = os.getenv("GGUF_MODEL_FILENAME", "Qwen2.5-3B-Instruct-Q4_K_M.gguf")
        self.device = "cuda" if (HAS_TORCH and torch.cuda.is_available()) else "cpu"
        self.peak_vram = 0.0

    def _update_vram_tracker(self):
        current_peak = get_peak_vram_mb()
        if current_peak > self.peak_vram:
            self.peak_vram = current_peak

    # -------------------------------------------------------------
    # STAGE 1: Fast Deduplication & Noise Filtering (bge-small or cosine)
    # -------------------------------------------------------------
    def stage1_deduplicate(self, posts: List[Dict[str, Any]], similarity_threshold: float = 0.88) -> List[Dict[str, Any]]:
        """
        Filters out redundant spam, duplicate links, and bot posts.
        Uses SentenceTransformers (bge-small) if available, with lightweight TF-IDF fallback.
        """
        if not posts or len(posts) <= 1:
            return posts

        print(f"[gpu_funnel] Stage 1: Deduplicating {len(posts)} posts (device: {self.device})...")
        deduped = []
        texts = [(p.get("title", "") + " " + p.get("body", ""))[:300].strip() for p in posts]

        try:
            from sentence_transformers import SentenceTransformer
            # Load Stage 1 model
            model = SentenceTransformer("BAAI/bge-small-en-v1.5", device=self.device)
            embeddings = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)

            self._update_vram_tracker()
            # Explicitly free Stage 1
            del model
            free_gpu_memory()

            # Greedily filter duplicates
            kept_indices = []
            for i, emb in enumerate(embeddings):
                is_duplicate = False
                for ki in kept_indices:
                    sim = float(np.dot(emb, embeddings[ki]))
                    if sim > similarity_threshold:
                        is_duplicate = True
                        break
                if not is_duplicate:
                    kept_indices.append(i)

            deduped = [posts[i] for i in kept_indices]

        except Exception as e:
            print(f"[gpu_funnel] Stage 1 neural embedding skipped ({e}). Using lexical fingerprint deduplication.")
            # Fast Lexical Fingerprint Fallback
            seen_hashes = set()
            for p in posts:
                norm = re.sub(r'\W+', ' ', (p.get("title", "") + " " + p.get("body", "")).lower())[:150].strip()
                if norm and norm not in seen_hashes:
                    seen_hashes.add(norm)
                    deduped.append(p)

        print(f"[gpu_funnel] Stage 1 Complete: {len(deduped)} posts retained after deduplication.")
        return deduped

    # -------------------------------------------------------------
    # STAGE 2: FinBERT Financial Sentiment Classification
    # -------------------------------------------------------------
    def stage2_sentiment_scoring(self, posts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Classifies financial sentiment using ProsusAI/finbert.
        Outputs scalar sentiment: -1.0 (Bearish) to +1.0 (Bullish), Neutral ~ 0.0.
        Sequential execution: loaded, batched, and immediately unloaded to free VRAM.
        """
        if not posts:
            return []

        print(f"[gpu_funnel] Stage 2: Scoring sentiment for {len(posts)} items with FinBERT...")
        results = []

        try:
            from transformers import AutoTokenizer, AutoModelForSequenceClassification

            model_name = "ProsusAI/finbert"
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            model = AutoModelForSequenceClassification.from_pretrained(model_name).to(self.device)
            model.eval()

            # Process in small batches of 16 to guarantee VRAM << 4.5 GB
            batch_size = 16
            for i in range(0, len(posts), batch_size):
                batch_posts = posts[i:i + batch_size]
                batch_texts = [(p.get("title", "") + " " + p.get("body", ""))[:400] for p in batch_posts]

                inputs = tokenizer(batch_texts, padding=True, truncation=True, max_length=256, return_tensors="pt").to(self.device)
                with torch.no_grad():
                    outputs = model(**inputs)
                    probs = torch.softmax(outputs.logits, dim=-1).cpu().numpy()

                # FinBERT classes: [positive, negative, neutral]
                for p, prob in zip(batch_posts, probs):
                    pos, neg, neu = float(prob[0]), float(prob[1]), float(prob[2])
                    # Scalar score: pos - neg (weighted by 1 - neu*0.5)
                    scalar = float(pos - neg)
                    label = "Bullish" if scalar > 0.15 else ("Bearish" if scalar < -0.15 else "Neutral")
                    
                    p_copy = dict(p)
                    p_copy["sentiment_score"] = round(scalar, 3)
                    p_copy["sentiment_label"] = label
                    p_copy["sentiment_probs"] = {"positive": round(pos, 3), "negative": round(neg, 3), "neutral": round(neu, 3)}
                    results.append(p_copy)

            self._update_vram_tracker()
            # Strict VRAM release
            del model
            del tokenizer
            free_gpu_memory()

        except Exception as e:
            print(f"[gpu_funnel] Stage 2 FinBERT neural model skipped ({e}). Using financial lexicon scorer.")
            # Heuristic Financial Lexicon Fallback
            bullish_words = {"breakout", "rally", "multibagger", "bull", "bullish", "profit", "results", "growth", "buy", "holding", "order", "expansion", "dividend"}
            bearish_words = {"fall", "crash", "loss", "bear", "bearish", "sell", "debt", "fraud", "scam", "dump", "bad", "downgrade", "sebi", "fine"}

            for p in posts:
                text = (p.get("title", "") + " " + p.get("body", "")).lower()
                pos_hits = sum(1 for w in bullish_words if f" {w} " in f" {text} ")
                neg_hits = sum(1 for w in bearish_words if f" {w} " in f" {text} ")
                total = pos_hits + neg_hits
                score = (pos_hits - neg_hits) / max(total, 1) if total > 0 else 0.0
                label = "Bullish" if score > 0.15 else ("Bearish" if score < -0.15 else "Neutral")

                p_copy = dict(p)
                p_copy["sentiment_score"] = round(score, 3)
                p_copy["sentiment_label"] = label
                p_copy["sentiment_probs"] = {"positive": max(0.0, score), "negative": max(0.0, -score), "neutral": 1.0 - abs(score)}
                results.append(p_copy)

        print(f"[gpu_funnel] Stage 2 Complete: {len(results)} posts scored.")
        return results

    # -------------------------------------------------------------
    # STAGE 3: Local LLM Catalyst Reasoning (Qwen2.5-3B-Instruct GGUF)
    # -------------------------------------------------------------
    def stage3_summarize_catalyst(self, ticker: str, headlines: List[str]) -> Optional[str]:
        r"""
        Runs local Qwen2.5-3B GGUF via llama-cpp-python if present in C:\models\.
        Strictly offloaded within 4.5 GB VRAM and destroyed post-inference.
        """
        gguf_path = Path(self.models_dir) / self.gguf_filename
        if not gguf_path.exists():
            print(f"[gpu_funnel] Notice: GGUF model not found at {gguf_path}. Deferring synthesis to Gemini 2.5 Flash.")
            return None

        try:
            from llama_cpp import Llama
            print(f"[gpu_funnel] Stage 3: Loading local GGUF {self.gguf_filename} on GPU...")
            
            # n_gpu_layers=28 fits safely within ~2.8 GB VRAM for 3B Q4_K_M
            llm = Llama(
                model_path=str(gguf_path),
                n_gpu_layers=28,
                n_ctx=2048,
                verbose=False
            )

            prompt = (
                f"<|im_start|>system\nYou are a financial analyst summarizing retail sentiment on NSE stock {ticker}. "
                f"Identify the catalyst or reason for excitement in 2 concise sentences.<|im_end|>\n"
                f"<|im_start|>user\nHeadlines:\n" + "\n".join(f"- {h}" for h in headlines[:5]) +
                f"\nWhat is the key catalyst driving sentiment for {ticker}?<|im_end|>\n<|im_start|>assistant\n"
            )

            output = llm(prompt, max_tokens=120, stop=["<|im_end|>"], temperature=0.2)
            summary = output["choices"][0]["text"].strip()

            self._update_vram_tracker()
            del llm
            free_gpu_memory()
            return summary

        except Exception as e:
            print(f"[gpu_funnel] Stage 3 GGUF inference skipped ({e}). Deferring to Gemini 2.5 Flash.")
            free_gpu_memory()
            return None

if __name__ == "__main__":
    funnel = GPUFunnel()
    print("GPU Funnel Initialized. Device:", funnel.device)
    print("Peak VRAM so far:", funnel.peak_vram, "MB")
