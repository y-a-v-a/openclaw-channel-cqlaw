# OpenClaw Morse Radio Channel — Operator Perspective

## Notes from the Ham Shack

This document captures operational, cultural, and ethical considerations for the Morse radio channel plugin from the perspective of a CW radio operator. It complements the technical implementation plan and should inform the SOUL.md prompt engineering in Phase 5.

---

## Speed Matching

CW operators range from 5 WPM beginners to 40+ WPM contest veterans. Sending faster than the other station is considered rude — it's the radio equivalent of shouting at someone who's speaking calmly. The agent must detect the incoming speed (fldigi can do this automatically) and match it on transmit. The rule is simple: match or slightly slow down, never speed up on the other station. This needs to be a hard behavioural constraint, not a suggestion the LLM can override.

## Timing and Turn-Taking

On a real band, the gap between one station finishing (sending K) and the other replying is typically under a second. Experienced operators notice hesitation. An LLM roundtrip of 2-5 seconds would feel noticeably slow to a seasoned CW op.

For casual QSOs this is forgivable — people pause to think, look up information, adjust equipment. But in contests, hesitation costs contacts and signals inexperience. The technical plan should address latency explicitly: pre-composing likely responses based on the QSO stage could help. If the agent just received a signal report and name, the next exchange is predictable enough to pre-draft while the other station is still transmitting.

## Band Manners and Frequency Etiquette

CW operators don't just transmit on any clear frequency. The protocol is: listen first, then send "QRL?" (is this frequency in use?), wait for a response, and only then start calling. A frequency is a shared, contested resource with implicit ownership — whoever was there first has priority.

The agent needs to understand that hearing another QSO in progress means "do not transmit here." Even if it decodes something that looks like its own callsign by coincidence, context matters. This is social protocol rather than technical — and exactly the kind of nuanced judgment an LLM could handle well, provided the SOUL.md encodes it properly.

## The "Lid" Factor

In ham radio culture, a "lid" is a poor operator — someone who doesn't follow conventions, sends sloppy code, or behaves rudely on the air. The community skews older, technically rigorous, and deeply tradition-conscious. An AI agent on CW would be scrutinised intensely.

Getting the etiquette 95% right isn't good enough. The remaining 5% is precisely what experienced operators notice and judge. Missed prosigns, incorrect QSO flow, wrong use of Q-codes, failing to QSL — these are the tells that mark an operator as inexperienced or careless. The SOUL.md must be written or thoroughly reviewed by someone who actually operates CW regularly. Desk research alone won't capture the unwritten conventions.

## Legal Identification Requirements

In virtually all jurisdictions, every transmission must include the station's callsign at least every 10 minutes and at the end of each communication. This is law, not convention. The agent must do this automatically and correctly — it should be a hard-coded timer-based behaviour, not left to the LLM's judgment. Missing an identification is a regulatory violation that could result in license consequences for the control operator.

## The Strongest Use Case: Listening, Not Talking

Most of the implementation plan focuses on the agent as a QSO participant. But the highest-value, lowest-risk use case is pure monitoring. The agent sits on a frequency (or scans multiple), decodes everything it hears, builds a structured picture of band activity, spots rare stations, and alerts the human operator when something interesting appears.

"I'm hearing VU2ABC on 20 meters with a 579 signal — that's India, you don't have them in your log yet."

No transmission means no regulatory concerns, no etiquette risks, no "lid" worries. Just an intelligent layer on top of what programs like CW Skimmer already do, but with the LLM's ability to contextualise and prioritise based on the operator's goals, log history, and band conditions.

This is probably the right Phase 1 use case for real-world deployment, with transmission capability added later once the agent has proven its understanding of operating conventions.

## DX Cluster and Spotting Networks

The DX cluster network (DXWatch, DX Summit) and the Reverse Beacon Network (RBN) are where operators share real-time spots of interesting stations heard around the world. The agent could consume these spots to know what's active globally, and potentially contribute spots back to the network.

RBN is especially relevant — it's already an automated CW monitoring network using CW Skimmer nodes. The agent would be doing essentially the same thing but with added intelligence: not just "heard PA3XYZ on 7.030 at 599" but "PA3XYZ is calling CQ on 40m, working stations slowly, good opening to Western Europe, your last QSO with them was 8 months ago."

Integration with these networks would make the agent genuinely useful to the wider amateur radio community rather than just a novelty project.

## QSO Memory Across Sessions

A hallmark of excellent operating is remembering previous contacts. "Hello Hans, we last worked on 40 meters back in March, how is the weather in Munich?" This kind of personal recall is deeply valued in the CW community and distinguishes a great operator from a merely competent one.

This is where OpenClaw's session memory and the contact log from Phase 5b converge naturally. The agent maintains a database of previous QSOs and pulls context when it recognises a returning callsign. Combined with QRZ.com data, the agent could have richer context about the other station than most human operators would remember — their location, their rig, their interests from their QRZ bio.

Done well, this would genuinely impress other operators. Done clumsily (reciting a dossier), it would feel uncanny.

## Pileup Awareness

When a rare station — a DXpedition to a remote island, a newly licensed country — starts calling CQ, dozens or hundreds of stations respond simultaneously. The resulting chaos is called a pileup. Decoding the target callsign from this mess is one of the hardest skills in CW operating and a point of genuine pride among operators.

The LLM can't help with the audio separation — that's fldigi's domain. But it could observe the DX station's operating pattern and advise strategy: "They're working stations geographically, listening up 2 kHz, your call area hasn't been worked yet — try now." This is the kind of pattern recognition that takes human operators years to develop.

## Community Reception

The ham radio community would have genuinely mixed feelings about an AI agent on the air. Some would find it technically fascinating — hams are experimenters by nature, and the intersection of AI and radio is novel. Others would see it as antithetical to the spirit of amateur radio, which is fundamentally about human-to-human communication, personal skill development, and the magic of making contact through your own effort and equipment.

This tension is real and worth taking seriously. A few considerations:

**Transparency matters.** If the agent transmits, the other station should know they're interacting with an AI-assisted operator. Operating undisclosed would be ethically questionable even where technically legal. A simple note in the QSO — "OP IS AI ASSISTED" or similar — would go a long way toward maintaining trust.

**Framing as augmentation, not replacement.** The most defensible positioning is the agent as an operator's assistant: handling logging, spotting, and bookkeeping while the human makes the decisions and enjoys the craft. This is philosophically similar to how contest operators already use computer logging, band maps, and CW Skimmer — the agent is a natural extension of existing computerised operating practices.

**The autonomy spectrum.** There's a meaningful difference between "AI decodes and logs while I operate" and "AI conducts QSOs while I sleep." The community would likely welcome the former and reject the latter. The implementation should make clear where on this spectrum it sits, and give the human operator meaningful control over what the agent does and doesn't do autonomously.

**Regulatory evolution.** Amateur radio regulations were written assuming human operators. As AI-assisted operating becomes feasible, regulatory bodies (FCC, OFCOM, Agentschap Telecom in the Netherlands) will need to clarify rules around automated and AI-assisted transmission. Being an early, responsible, and transparent participant in this space could help shape those rules constructively.

---

## Summary

The strongest path forward starts with listening — an intelligent monitoring agent that enhances the operator's awareness without touching the transmit button. This avoids regulatory complexity, sidesteps community controversy, and delivers genuine value immediately. Transmission capability can be layered on once the agent has demonstrated solid operating conventions and the operator community has had a chance to see it in action.

The LLM's unique advantages in this domain are contextual understanding (noisy decode cleanup, QSO flow tracking), memory (cross-session callsign recognition), and information synthesis (propagation + cluster + log data combined into actionable advice). The CW protocol's rigid structure actually makes it easier for an LLM to participate correctly — provided the conventions are thoroughly encoded in the system prompt and validated by experienced operators.
