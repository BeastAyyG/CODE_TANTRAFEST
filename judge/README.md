# AegisDAO local judge

A tiny, fully local accept/reject judge for DAO proposals. It reads a proposal's
stated requirement and its decoded actions, and returns a verdict. It is the
same judge verified on Oct 26, 2026: it accepted a clean proposal and rejected
one with a hidden proxy-upgrade action, both as clean JSON.

## Setup

1. Install Ollama (https://ollama.com/download).
2. Pull the model: `ollama pull qwen2.5:3b`
3. Make sure the Ollama server is running (it starts automatically with the app).

No API keys, no cloud calls. The model runs on your own machine.

## Usage

```bash
node judge.mjs < test-case.json
```

Input JSON:

```json
{
  "requirement": "Treasury diversification: transfer exactly 50000 USDC to the disclosed yield vault.",
  "actions": ["ERC20 transfer of 50000 USDC to the disclosed yield vault"]
}
```

Output JSON:

```json
{ "verdict": "accept", "reason": "Action matches the requirement exactly." }
```

Try the included cases in `test-cases.json` (one per run, as the input file):

- `clean-proposal` -> expected `accept`
- `hidden-upgrade` -> expected `reject`

Environment overrides: `JUDGE_MODEL` (default `qwen2.5:3b`),
`OLLAMA_URL` (default `http://localhost:11434/api/generate`).

## Where it fits in AegisDAO

Call the judge before the vote, alongside the evidence pipeline and COI
assessment: requirement in, decoded actions in, verdict out. A `reject` here
is an advisory signal for voters; on-chain refusal at execution time stays
with the IntentLock contracts.
