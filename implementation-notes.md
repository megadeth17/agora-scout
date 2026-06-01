# Implementation Notes — Agora Scout

## 2026-05-29 — Public commit-then-act verifier
- **Decisión:** Endpoint read-only `GET /api/verify/{id}` + botón "Verify on-chain" por rebalance. Verificación en 2 niveles: (L1) decision_hash guardado == calldata on-chain; (L2) recompute SHA-256 del payload canónico == decision_hash. Juntos = cadena `payload → hash → on-chain`.
- **Razón:** El pitch reclamaba "tamper-proof, verifiable on Arcscan" sin forma de verificarlo. Esto lo vuelve un feature provable = entrega el "audit layer" prometido en el grant de Circle. EV+ alto para jueces de un primitive de accountability.
- **Tradeoff:** Requirió persistir `decision_payload` canónico nuevo en tabla rebalances (antes solo guardaba el hash → no recomputable). Migración idempotente. Filas legacy (sin payload) verifican solo L1; nuevas obtienen L1+L2.
- **Seguridad:** Endpoint 100% read-only (cero writes/capital). `rebalance_id: int` en path → non-int = 422 (anti-injection). RPC solo lectura (`eth_getTransactionByHash`) vía cliente web3 key-free.
- **Cambios al plan:** VPS config.py y requirements.txt estaban DIVERGENTES del repo local (config sin ARC_PRIVATE_KEY/CHAIN_ID/ARCSCAN_TX_BASE; requirements sin web3==7.6.0). El `--build` reveló la divergencia (web3 faltaba → rompía anchoring+verifier). Fix: append 3 attrs a config.py VPS + scp requirements.txt correcto. VPS git queda divergente (chain.py untracked allí) — deploy por scp directo al working tree, NO git pull.
- **Verificado:** unit tests 4/4 (hash recompute + tamper); /api/verify/113 live → verified=true (L1, calldata==hash); 404 missing / 422 non-int OK; público vía funnel OK; frontend sirve VerifyButton sin errores transform.

### Deuda técnica detectada (no bloqueante)
- VPS `/root/agora-scout` git divergente del remote (HEAD anterior al commit de anchoring; chain.py untracked). Deploy actual = scp al working tree. Reconciliar VPS git con GitHub en sesión futura para evitar drift.
- VPS config.py / requirements.txt estaban desincronizados del repo — revisar que VPS quede igual a GitHub.
