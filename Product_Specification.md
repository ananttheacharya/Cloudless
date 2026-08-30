**P R O D U C T S P E C I F I C A T I O N**

# Zero-Trust Local-First Enterprise Document Collaboration Fabric

*A Peer-to-Peer, CRDT-Based, Blockchain-Anchored Architecture for Secure Collaborative Editing* *at Enterprise Scale*

### Version 1.0

Smart India Hackathon — Internal Submission August 2026

# Table of Contents

Table of Contents.......................................................................................................................................... 2

1. Abstract..................................................................................................................................................... 1
2. System Design Principles........................................................................................................................... 1
3. Architecture Overview.............................................................................................................................. 1
4. Layer 1 — Local-First Editing Core............................................................................................................ 3
4.1 Formal Model: Strong Eventual Consistency...................................................................................... 3
4.2 Rich-Text CRDT: Peritext..................................................................................................................... 3
4.3 Merge Algorithm: Eg-walker Complexity Class................................................................................... 4
5. Layer 2 — Zero-Trust Peer-to-Peer Synchronization................................................................................ 5
5.1 Peer Identity and Transport................................................................................................................ 5
5.2 Mutual Authentication Protocol......................................................................................................... 5
5.3 Merkle-DAG Differential Synchronization.......................................................................................... 5
6. Layer 3 — Identity & Access Ledger.......................................................................................................... 7
6.1 Permissioned Ledger and Byzantine Fault Tolerance......................................................................... 7
6.2 Merkle Proof-of-Access Verification................................................................................................... 7
6.3 Attribute-Based Key-Wrapping........................................................................................................... 8
7. Layer 4 — Durability & Cold Storage......................................................................................................... 9
7.1 Content-Addressed Storage and Structural Deduplication................................................................ 9
7.2 Storage Complexity Comparison......................................................................................................... 9
7.3 Checkpoint Cadence........................................................................................................................... 9
8. End-to-End Data Flow............................................................................................................................. 10
8.1 Edit Propagation Sequence............................................................................................................... 10
8.2 Access Revocation Sequence............................................................................................................ 10
9. Comparative Complexity Analysis........................................................................................................... 11
10. Threat Model & Mitigations.................................................................................................................. 12
11. Technology Stack.................................................................................................................................. 13
12. Known Limitations................................................................................................................................ 14
13. References............................................................................................................................................ 14

<u>Zero-Trust Local-First Document Fabric — Product Spec v1.0</u>

# 1. Abstract

This document specifies the complete system architecture, mathematical foundations, cryptographic protocols, and technology stack of a zero-trust, peer-to-peer (P2P) enterprise document collaboration platform. The system replaces server-mediated collaboration (the architecture underlying Google Docs, SharePoint, and Notion) with a local-first model in which every participating device holds a primary, independently-editable replica of the shared document state, synchronized opportunistically via Conflict-Free Replicated Data Types (CRDTs), authenticated peer-to-peer transport, and a permissioned Byzantine Fault-Tolerant (BFT) ledger for access-control auditing.

The specification is organized into four architectural layers (L1–L4), each addressed with its governing data structures, algorithms, complexity bounds, and security guarantees, followed by a consolidated data-flow model, threat model, and comparative complexity analysis against conventional cloud-hosted document systems.

# 2. System Design Principles

The architecture is constrained by five non-negotiable design axioms, each of which is directly reflected in a specific layer of the stack:

- Axiom 1 (Device Primacy): the editing device is the primary replica of record; any server or peer is merely an additional replica in the replication set, never an authority the client blocks on.
- Axiom 2 (Content Identity): a document's canonical identity is the cryptographic hash of its content, h = H(D), not a filesystem path or server-assigned identifier. Two byte-identical documents are, by construction, the same object.
- Axiom 3 (Zero Implicit Trust): no peer, message, or request is trusted by virtue of network position (IP address, subnet, VPN membership); every principal authenticates cryptographically before any state-mutating operation is accepted.
- Axiom 4 (Speed–Durability Separation): high-frequency operations (keystrokes) are separated from low-frequency, consensus-bound operations (access grants, durability checkpoints) so that consensus latency never sits in the interactive critical path.
- Axiom 5 (Independent Auditability): every access-control decision must be verifiable by a third party without needing to trust the application server or its operator.
# 3. Architecture Overview

The system is organized into four layers, summarized in Table 1 and elaborated with full mathematical treatment in Sections 4–7.

|Layer Name|Primary Responsibility|Governing Structure|
|---|---|---|
|L1 Local-First Editing Core|Instant, conflict-free local edits|CRDT / join-semilattice|

|Layer|Name|Primary Responsibility|Governing Structure|
|---|---|---|---|
|L2|Zero-Trust P2P Sync|Authenticated peer discovery & diff exchange|libp2p + Merkle-DAG|
|L3|Identity & Access Ledger|Auditable access control|Permissioned BFT ledger|
|L4|Durability & Cold Storage|Deduplicated, content-addressed persistence|Content-addressed DAG (IPFS)|

*Table 1. The four architectural layers and their governing mathematical structures.*

# 4. Layer 1 — Local-First Editing Core

Layer 1 is responsible for the property that every keystroke commits to local state with zero network round-trip. This is achieved using Conflict-Free Replicated Data Types (CRDTs), a class of replicated data structures with formally provable convergence guarantees under concurrent, out-of-order updates.

## 4.1 Formal Model: Strong Eventual Consistency

Let a distributed system consist of a set of replicas R = {r₁, r₂, ..., rₙ}, each maintaining a local state sᵢ ∈ S drawn from a state space S. Each replica applies a sequence of update operations and periodically merges state received from other replicas via a merge function ⊕ : S × S → S. Following Shapiro et al. (2011), a replicated data type satisfies Strong Eventual Consistency (SEC) if it guarantees:

- Eventual Delivery: every update applied at any correct replica is eventually delivered to every other correct replica.
- Termination: every method execution terminates in finite time (no unbounded blocking merges).
- Strong Convergence: for any two replicas i and j, if they have observed the same causal history of updates (cᵢ = cⱼ) at some point, then from that point onward their states are guaranteed to be equivalent (sᵢ ≡ sⱼ) permanently — once converged, replicas never diverge again.
A data type that satisfies these three properties is termed a Conflict-Free Replicated Data Type (CRDT). The sufficient algebraic condition Shapiro et al. establish for SEC is that the state space (S, ≤) forms a join-semilattice — a partially ordered set in which every pair of elements has a unique least upper bound — and that the merge operator ⊕ computes exactly this least upper bound: sᵢ ⊕ sⱼ = lub(sᵢ, sⱼ). Because ⊕ is commutative, associative, and idempotent by the semilattice laws, the order in which updates are merged does not affect the final state — this is the formal reason concurrent, out-of-order network delivery cannot cause divergence.

Convergence Theorem: ∀ updates u₁, u₂ that are causally concurrent (u₁ ∥ u₂), apply(apply(s, u₁), u₂) = apply(apply(s, u₂), u₁)

This commutativity-of-concurrent-operations property is the abstract convergence theorem later machine-verified in the Isabelle/HOL proof assistant for concrete CRDTs including the Replicated Growable Array (RGA), the Observed-Remove Set (OR-Set), and increment/decrement counters, closing correctness gaps that had previously affected several published CRDT algorithms whose convergence proofs were found to be flawed.

## 4.2 Rich-Text CRDT: Peritext

Plain-sequence CRDTs (e.g., RGA) correctly merge character insertions and deletions but do not specify semantics for concurrent formatting operations (e.g., one user bolding a span while another user deletes part of it). Layer 1 adopts the Peritext algorithm (Litt, Lim, Kleppmann & van Hardenberg, ACM CSCW/PACM HCI, 2022), which extends sequence CRDTs with:

- Formatting spans represented as a separate CRDT layer of (mark-start, mark-end, attribute) triples anchored to stable character identifiers rather than numeric offsets, so that concurrent insertions do not silently shift a bold range's boundaries.
- A deterministic conflict-resolution rule for overlapping concurrent formatting operations, ensuring all replicas converge to the same rendered formatting regardless of network delivery order — a direct instance of the SEC guarantee applied to a richer state space than plain text.
## 4.3 Merge Algorithm: Eg-walker Complexity Class

Classical CRDT implementations face two competing costs: operation-based CRDTs (OT-style) merge long-diverged branches slowly because they must transform every operation against every intervening operation, while naive state-based CRDTs consume memory proportional to the full operation history and are slow to load from cold storage. The Eg-walker collaboration algorithm (2025) resolves this tension by replaying the operation DAG using an event-graph walk that reconstructs merge results without retaining per-operation transformation state, achieving:

- An order-of-magnitude reduction in steady-state memory footprint relative to prior general- purpose CRDT implementations.
- Orders-of-magnitude faster cold-load time from persisted history.
- Orders-of-magnitude faster merge time for branches that diverged over long offline periods, compared with Operational Transformation, while remaining correct in fully peer-to-peer topologies with no central sequencing server.
Layer 1 is implemented using Automerge 3.0 (Rust core compiled to WebAssembly) or the Loro CRDT engine as an equivalent runtime, both of which ship Eg-walker–class merge characteristics and run natively inside a browser sandbox — eliminating the need for a native OS-level installation.

# 5. Layer 2 — Zero-Trust Peer-to-Peer Synchronization

Layer 2 governs how devices discover each other and exchange CRDT operation history without a mediating server, while satisfying Axiom 3 (Zero Implicit Trust).

## 5.1 Peer Identity and Transport

Every peer p is identified by an asymmetric keypair (pkₚ, skₚ) generated locally at first run. Peer identity is therefore a cryptographic fact, not a network fact — an IP address or subnet membership carries zero authentication weight. Transport is provided by libp2p using the WebRTC-Direct transport, stabilized in the 2025 libp2p release cycle, which allows browser-native peers to establish a direct connection without a TLS certificate authority or DNS-registered domain name, removing the dependency on centralized PKI infrastructure for peer connectivity while retaining end-to-end transport encryption via DTLS-SRTP — the same default encryption mechanism used by WebRTC generally, which was adopted specifically because predecessor key-agreement schemes (SDES, ZRTP, MIKEY) were shown to be susceptible to man-in-the-middle attacks in comparative analysis.

## 5.2 Mutual Authentication Protocol

Before any CRDT operation-log data is exchanged, peers execute a mutual challenge-response handshake:

- 1. Peer A transmits pkₐ and a random nonce nₐ.
- 2. Peer B verifies pkₐ against the document's authorized-peer set (obtained from Layer 3), signs nₐ with skᵇ, and returns (pkᵇ, Sign(skᵇ, nₐ), nᵇ).
- 3. Peer A verifies Sign(skᵇ, nₐ) against pkᵇ, and signs nᵇ in return.
- 4. Only after both signatures verify does either peer accept operation-log traffic from the other — this is the concrete zero-trust gate: network reachability alone never authorizes data exchange.
## 5.3 Merkle-DAG Differential Synchronization

The CRDT operation log is structured as a Merkle-DAG (a directed acyclic graph of hash-linked operation nodes), following the Merkle-CRDT construction (Sanjuan et al., 2020), which fuses Git/IPFS-style content addressing with CRDT merge semantics. Each operation node stores the cryptographic hash of its own payload concatenated with the hashes of its causal parents:

h(op) = H( payload(op) ∥ h(parent₁) ∥ h(parent₂) ∥ ... ∥ h(parentₖ) )

Synchronization between two peers proceeds as a set-reconciliation over DAG frontiers: each peer advertises the hash of its most recent operation nodes; the receiving peer walks backward only until it reaches a hash it already possesses, then requests exactly the missing subgraph. If a document has N total operations and two replicas differ by only Δ unsynced operations, the bandwidth cost of synchronization is O(Δ), independent of N — in contrast to a full-document transfer model whose cost is

O(N) regardless of how small the actual edit was. This is the formal justification for the 'diff-only sync' benchmark claim in Section 9.

# 6. Layer 3 — Identity & Access Ledger

Layer 3 satisfies Axiom 5 (Independent Auditability): every grant or revocation of document access must be provable to a third party without requiring that party to trust the application server's database.

## 6.1 Permissioned Ledger and Byzantine Fault Tolerance

Access-control events (grant, revoke, key-rotation) are committed to a permissioned distributed ledger operated by a consortium of validator nodes under enterprise / departmental control (a Hyperledger Fabric-class deployment), rather than a public proof-of-work chain — avoiding transaction fees and the multi-minute finality latency of public chains, which is incompatible with an access-control system that must respond to revocation requests promptly.

Consensus among validator nodes follows the Practical Byzantine Fault Tolerance (PBFT) family of protocols. For a validator set of size n tolerating up to f Byzantine (arbitrarily malicious) nodes, PBFT and its derivatives (including the SmartBFT protocol used in modern Hyperledger Fabric releases) require:

n ≥ 3f + 1, with a commit quorum of size Q = ⌈(2n)/3⌉

This bound arises because the protocol must guarantee that any two quorums of size Q intersect in at least one correct (non-Byzantine) node, which requires 2Q > n + f. Consensus proceeds through three message phases — pre-prepare, prepare, and commit — with a replica advancing to the next phase only after collecting matching messages from at least n − f other replicas, guaranteeing both safety (no two correct replicas ever commit conflicting values) under fully asynchronous network conditions, and liveness under a bounded-synchrony assumption. For a minimal fault-tolerant deployment (f = 1), this implies a validator set of at least 4 nodes, with production deployments typically recommending 7 or more nodes for resilience during maintenance windows.

## 6.2 Merkle Proof-of-Access Verification

Rather than embedding full document metadata on-ledger (expensive and unnecessary), each ledger block commits only the Merkle root of a batch of access-control events. An external auditor verifying that a specific grant/revoke event occurred does not need to download the full batch — a Merkle inclusion proof suffices.

For a batch of n leaf events, the Merkle inclusion proof consists of exactly ⌈log₂ n⌉ sibling hashes: the verifier recomputes the path from the target leaf to the published root by iteratively hashing the target with each provided sibling, and compares the result against the known root. This yields:

Proof size = O(log n) hashes, Verification time = O(log n) hash operations

in contrast to a naive O(n) verification that would require re-hashing the entire batch. For a batch of one million access events, this reduces verification from one million hash operations to approximately twenty — a property directly inherited from the same Merkle-tree construction used for transaction verification in Bitcoin and for consistency proofs in Certificate Transparency logs.

## 6.3 Attribute-Based Key-Wrapping

Document confidentiality is enforced cryptographically, not merely by database access-control flags. Each document D is encrypted under a per-document symmetric content key k_D (AES-256-GCM). For each authorized user u, k_D is wrapped (encrypted) under u's public key: w_u = Enc(pk_u, k_D). The set of wrapped keys {w_u} for all currently-authorized users is what the ledger references — not the content key itself, which never appears in plaintext outside an authorized client.

Revocation of user u's access is implemented as omission, not deletion: on the next key-rotation epoch, a new content key k_D' is generated and re-wrapped only for the remaining authorized set; u is not issued w'_u and therefore cannot decrypt any subsequently checkpointed state. This gives forward revocation (u loses access to future content) without requiring a global broadcast 'delete' operation, and every rotation event is itself a signed, timestamped ledger transaction per Section 6.1 — so an auditor can reconstruct, for any point in time, exactly who could decrypt a given document version.

# 7. Layer 4 — Durability & Cold Storage

Layer 4 provides durable, deduplicated persistence without placing storage I/O in the interactive editing path (Axiom 4).

## 7.1 Content-Addressed Storage and Structural Deduplication

Each durable checkpoint of the CRDT state is content-addressed: its storage key is k = H(bytes), the cryptographic hash of its own serialized bytes, computed and stored in a self-hosted, private IPFS cluster (kept private specifically to satisfy enterprise data-residency requirements — public IPFS is not used). This yields a deduplication guarantee that requires no separate deduplication engine: if two checkpoints — from any two documents, any two collaborators, any two points in time — are byte-identical, they hash to the same key and are, by construction, the same stored object. Formally, for a storage function store: Bytes → Key with store(b) = H(b), the map is idempotent under re-storage: storing b a second time is a no-op, since H(b) already resolves to existing content.

## 7.2 Storage Complexity Comparison

Let a document undergo V versions across C collaborators over its lifetime, with each version differing from its predecessor by an average of δ bytes. Under a conventional full-copy synchronization model (as used by most enterprise document platforms), total storage grows as:

### Storage_full-copy = O(V × C × |D|)

where |D| is the full document size — because each collaborator's client and each backup snapshot independently stores a complete copy of every version. Under the content-addressed, diff-based model of Layers 1 and 4, storage grows instead as:

Storage_content-addressed = O(V × δ) + O(|D|) (one full copy, plus one diff per version)

Because δ ≪ |D| for typical incremental edits, and the C multiplier disappears entirely (collaborators reference the same content-addressed objects rather than each storing an independent full copy), this is the formal basis for the storage-efficiency benchmark claim in Section 9.

## 7.3 Checkpoint Cadence

To keep Layer 3 ledger writes and Layer 4 storage writes off the interactive critical path (Axiom 4), checkpoints are taken at a bounded cadence — either after a fixed number of local operations N_ops (typically 50–200 operations) or a fixed wall-clock interval T_ckpt (typically 30–60 seconds of active editing), whichever occurs first. This bounds both the worst-case data loss window (bounded by T_ckpt) and the ledger transaction rate (bounded by editing-session-count / T_ckpt), keeping consensus overhead from Section 6.1 from ever gating keystroke latency.

# 8. End-to-End Data Flow

## 8.1 Edit Propagation Sequence

- 1. User keystroke → CRDT apply() mutates local state sᵢ → O(1) amortized local operation, no network call.
- 2. New operation node appended to local Merkle-DAG operation log; node hash computed per §5.3.
- 3. Operation broadcast to currently-connected, mutually-authenticated peers (§5.2) over DTLS-SRTP-encrypted WebRTC-Direct channels.
- 4. Receiving peers verify the sender's signature, walk the DAG to identify missing ancestor nodes (if any), request them, and merge via the CRDT join operator ⊕ (§4.1) — convergence is guaranteed regardless of arrival order.
- 5. At the next checkpoint boundary (§7.3), the local CRDT state is serialized, hashed, and persisted to the private IPFS cluster (§7.1).
- 6. If the checkpoint represents a new canonical version, its content hash is registered in a Layer- 3 ledger transaction (§6.1), subject to PBFT consensus among validator nodes.
## 8.2 Access Revocation Sequence

- 1. Administrator submits a revoke(document_id, user_id) transaction, signed with the administrator's key.
- 2. Transaction is broadcast to validator nodes and ordered via PBFT consensus (§6.1); a commit is finalized once ⌈(2n)/3⌉ validators agree.
- 3. On the next key-rotation epoch, a new content key k_D' is generated and wrapped (§6.3) only for the remaining authorized set — the revoked user is excluded.
- 4. The revoke transaction and the new wrapped-key set are both included in the next Merkle-batched ledger commit (§6.2), making the revocation independently auditable without trusting the application server.
Page 10 of 17

# 9. Comparative Complexity Analysis

The following table consolidates the asymptotic and empirical comparisons implied by the mathematical treatment in Sections 4–7, benchmarked against a conventional server-mediated cloud document platform.

|Metric|This System|Conventional Cloud Platform|Governing Result|
|---|---|---|---|
|Time to first edit visible|O(1), local apply, ~0 ms|O(RTT), 1 network round-trip (100s of ms)|§4.1 (local CRDT apply)|
|Sync bandwidth per edit|O(Δ), diff-only|O(|D|) or O(operation batch)|§5.3 (Merkle-DAG diff sync)|
|Storage across V versions, C collaborators|O(V×δ) + O(|D|)|O(V×C×|D|)|§7.2|
|Merge after long offline divergence|Eg-walker–class, near- instant|OT-based, degrades with divergence length|§4.3|
|Access-log verification cost (n events)|O(log n) hashes|O(n) — trust the admin DB / full re-audit|§6.2 (Merkle proof)|
|Fault tolerance of access ledger|Tolerates f Byzantine nodes at n≥3f+1|Single point of failure (central DB)|§6.1 (PBFT)|
|Availability under central- server outage|Continues via authenticated P2P sync|Full outage|§5 (P2P transport)|

# 10. Threat Model & Mitigations

|Threat|Vector|Mitigation|Reference|
|---|---|---|---|
|Man-in-the-middle on sync channel|Malicious relay / network operator|DTLS-SRTP transport encryption; mutual public-key authentication before any data exchange|§5.1, §5.2|
|Sybil peer impersonation|Attacker spoofs multiple peer identities|Peer identity is a cryptographic keypair, not network-derived; authorized-peer set is ledger- verified, not self-declared|§5.2, §6.3|
|Unauthorized document access after revocation|Former collaborator retains old client state|Forward-revocation via key non- rotation (§6.3); revoked user cannot decrypt any post- rotation checkpoint|§6.3|
|Malicious / Byzantine validator node|Compromised or colluding ledger operator|PBFT tolerates up to f Byzantine nodes at n≥3f+1 with cryptographic quorum certificates|§6.1|
|Tampering with access history|Application server operator edits DB records|All grant/revoke events are on an immutable, Merkle-batched, multi-party-signed ledger — independently auditable|§6.1, §6.2|
|Storage-side data exposure|Compromise of the IPFS cluster host|Content is encrypted client-side under k_D before leaving the device; cluster operator sees only ciphertext|§6.3, §7.1|
|Firewall / NAT traversal failure|Restrictive enterprise network policy blocks direct P2P|Documented limitation — mitigated via a relay/fallback node (TURN-equivalent); not silently ignored|§5.1, §12|

# 11. Technology Stack

|Layer|Component|Technology|Rationale|
|---|---|---|---|
|L1|CRDT runtime|Automerge 3.0 (Rust→WASM) / Loro|10x memory reduction vs. prior CRDT cores (2025); runs in- browser|
|L1|Rich-text merge|Peritext algorithm|Formally specified concurrent rich-text CRDT semantics|
|L2|P2P transport|libp2p + WebRTC-Direct|Certificate-less, domain-less browser-native P2P (stabilized 2025)|
|L2|Transport encryption|DTLS-SRTP|WebRTC default; predecessor protocols proven MITM- vulnerable|
|L3|Ledger|Hyperledger Fabric (SmartBFT ordering)|Permissioned, no gas fees, PBFT-class fault tolerance|
|L3|Key wrapping|AES-256-GCM (content) + X25519/ECIES (key wrap)|Industry-standard authenticated encryption + key exchange|
|L4|Cold storage|Self-hosted private IPFS cluster|Content-addressed, enterprise data residency|
|Frontend|Client shell|React + TypeScript|WASM-CRDT integration, cross- platform (Windows/Linux/macOS via browser)|
|Backend (validator nodes)|Ledger peer runtime|Go (Fabric peer binaries) / Node.js orchestration|Production Fabric tooling|
|Infra|Deployment|Docker + Kubernetes|Reproducible validator-node and relay-node deployment|
|Infra|CI / code quality|Jenkins, SonarQube|Automated build, static analysis, security scanning|

# 12. Known Limitations

- NAT/firewall traversal: WebRTC-Direct P2P connections can be blocked by restrictive enterprise firewalls; mitigated by a relay/fallback node, at the cost of reintroducing a single relay hop (not a full outage, but not pure P2P for that session).
- Validator-node availability: the permissioned ledger requires a minimum of 3f+1 always-on validator nodes; “decentralized” in this design means no single point of edit-mediation, not zero infrastructure.
- Large embedded media: very large embedded objects (video, high-resolution images) inside a document require chunked storage strategies on Layer 4 not detailed in this revision; treated as future work.
- Key-rotation latency: forward revocation (§6.3) takes effect at the next rotation epoch, not instantaneously; the epoch length is a tunable security/performance trade-off.
# 13. References

**[1]** Shapiro, M., Preguiça, N., Baquero, C., & Zawirski, M. (2011). Conflict-Free Replicated Data Types. INRIA Technical Report / SSS 2011. [https://www.lip6.fr/Marc.Shapiro/papers/2011/CRDTs_SSS-2011.pdf](https://www.lip6.fr/Marc.Shapiro/papers/2011/CRDTs_SSS-2011.pdf)

**[2]** Gomes, V. B. F., Kleppmann, M., Mulligan, D. P., & Beresford, A. R. (2017). Verifying Strong Eventual Consistency in Distributed Systems. Proc. ACM Program. Lang. 1(OOPSLA), Article 109. [https://martin.kleppmann.com/papers/crdt-isabelle-oopsla17.pdf](https://martin.kleppmann.com/papers/crdt-isabelle-oopsla17.pdf)

**[3]** Litt, G., Lim, M., Kleppmann, M., & van Hardenberg, P. (2022). Peritext: A CRDT for Collaborative Rich Text Editing. Proc. ACM Hum.-Comput. Interact. 6(CSCW2).

**[4]** Eg-walker: a 2025 event-graph-walk collaboration algorithm for local-first CRDT systems, addressing memory, load-time, and long-branch merge performance simultaneously in fully peer-to-peer settings.

**[5]** Automerge 3.0 Release Notes (2025). Rust-core CRDT library with WASM bindings and ~10x memory-efficiency improvement over prior versions. [https://automerge.org](https://automerge.org)

**[6]** Sanjuan, S., Poyhtari, S., Teixeira, P., & Ovezov, D. (2020). Merkle-CRDTs: Merkle-DAGs meet CRDTs. IPFS / Protocol Labs Research.

**[7]** libp2p Annual Report (2025). WebRTC-Direct stabilization, AutoNAT v2, and browser-native P2P connectivity. [https://libp2p.io/reports/annual-reports/2025/](https://libp2p.io/reports/annual-reports/2025/)

**[8]** The Security of WebRTC (analysis of DTLS-SRTP vs. SDES/ZRTP/MIKEY key-agreement vulnerability to MITM attacks). ResearchGate.

**[9]** Castro, M., & Liskov, B. (1999). Practical Byzantine Fault Tolerance. Proceedings of OSDI '99.

**[10]** A Byzantine Fault-Tolerant Consensus Library for Hyperledger Fabric (SmartBFT). arXiv:2107.06922.

**[11]** Hyperledger Fabric v3: Delivering Smart Byzantine Fault Tolerant Consensus. Linux Foundation Decentralized Trust, 2024–25 blog series.

**[12]** Merkle, R. C. (1988). A Digital Signature Based on a Conventional Encryption Function. CRYPTO '87.

**[13]** TOPO: Time-Ordered Provable Outputs — Merkle tree construction and O(log n) proof complexity. arXiv:2411.00072.

**[14]** Automatic Verification of Transparency Protocols (Merkle-tree inclusion proofs, O(log n) complexity vs. O(n) hash lists). arXiv:2303.04500.

**[15]** Kleppmann, M., Wiggins, A., van Hardenberg, P., & McGranaghan, M. (2019). Local-First Software: You Own Your Data, in spite of the Cloud. Proc. ACM Onward! 2019.

**[16]** Systematic Literature Review of Zero Trust Architecture across 74 peer-reviewed studies, 2016–2025. PMC / NCBI, 2025. [https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12526847/](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12526847/)

**[17]** Zero-Trust Strategies for O-RAN Cellular Networks: Principles, Challenges and Research Directions. arXiv:2511.18568 (2025).

**[18]** Diaz Rivera, J. J., Muhammad, A., & Song, W.-C. (2024). Securing Digital Identity in the Zero Trust Architecture: A Blockchain Approach to Privacy-Focused Multi-Factor Authentication. IEEE Open Journal of the Communications Society, 5, 2792–2814.

**[19]** Zero-Trust Foundation Models: A New Paradigm for Secure and Collaborative AI for IoT. arXiv:2505.23792 (2025).

**[20]** Siffre, L., Ledoux, T., Pawlak, R., & Guery, A. (2025). Local-First Software for Green IT. Proceedings of ICT4S

2025.
Page 15 of 17