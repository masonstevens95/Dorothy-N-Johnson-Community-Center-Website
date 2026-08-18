---
date: 2026-08-15
topic: community-center-website
---

# Dorothy N Johnson Community Center Website

## Summary

A public, mobile-first site that mirrors the center's physical bulletin board — a current calendar of what's happening and a gallery of active and past projects — maintained by one volunteer, with a no-account submission queue so program directors and the community watch can contribute without learning an admin panel. No payments, memberships, or visitor accounts in v1.

---

## Problem Frame

The Dorothy N Johnson Community Center publishes its schedule on a physical bulletin board inside the building. There is no online calendar. The center appears on a city/parks page, which lists static facility information and answers none of the questions a resident actually has.

The consequence is that the center's information is locked to the building. To learn what is happening, you have to already know to walk over and read a board — which means the people best served by the center are the ones already connected to it. A resident who recently moved into the neighborhood has no path in. They cannot discover a program, cannot see that the center is active, and cannot tell whether the place is worth their Saturday. The center's work is invisible to exactly the people it would most benefit.

The second-order cost is the projects themselves. The community garden, the community watch, and the various programs have a history that exists only as memory and as flyers that come down when they age out. Nothing accumulates. A newcomer evaluating whether to get involved sees a locked door and a municipal listing.

There is no institutional owner for fixing this. Several program directors and the community watch each post to the board independently; none has asked for software, and none has committed to maintaining anything. Any solution that requires their coordination up front does not survive contact with reality.

---

## Actors

- A1. Newcomer resident: recently moved to the neighborhood, wants to know what happens at the center and whether it's worth showing up. Never signs in. The primary audience.
- A2. Maintainer: the volunteer who runs the site. Sole admin. Transcribes the bulletin board, publishes events, moderates submissions. Currently a single person with no backup.
- A3. Contributor: a program director or community watch organizer who posts to the physical board. Has not asked for this and will not learn an admin tool; may submit an event or hand over a flyer if the friction is near zero.
- A4. Future owner: center staff or board who may take over the site later. Not involved today; the design should not prevent the handoff.

---

## Key Flows

- F1. Newcomer finds out what's happening
  - **Trigger:** A1 searches for the center or follows a link, on a phone.
  - **Actors:** A1
  - **Steps:** Lands on the site → sees upcoming events in date order without navigating → opens one for detail and location → optionally browses the gallery to gauge whether the center is active.
  - **Outcome:** A1 knows what is happening this week and how current that information is, without visiting the building.
  - **Covered by:** R1, R2, R3, R5, R7, R8, R9

- F2. Maintainer transcribes the bulletin board
  - **Trigger:** A2 is standing at the board, phone in hand.
  - **Actors:** A2
  - **Steps:** Signs in on phone → photographs a flyer → creates an event with minimal required fields, attaching the photo → publishes → confirms other already-listed events that are still accurate, without editing them.
  - **Outcome:** The site reflects the board, and every event carries a fresh confirmation date.
  - **Covered by:** R12, R13, R14, R15, R16

- F3. Contributor submits without an account
  - **Trigger:** A3 wants an event listed, or A2 asks them to send it over.
  - **Actors:** A3, A2
  - **Steps:** A3 opens the public submission form → enters minimal details or attaches a flyer photo → submits → the item enters a pending queue, invisible to the public → A2 reviews, edits if needed, and approves or rejects.
  - **Outcome:** A3 contributed with no account and no training; A2 retains editorial control.
  - **Covered by:** R17, R18, R19, R20, R21

- F4. Information goes stale
  - **Trigger:** A2 gets busy, travels, or stops maintaining the site.
  - **Actors:** A1, A2
  - **Steps:** Events pass their confirmation window without A2 confirming them → the site marks those events as unverified rather than presenting them as current → if the whole site goes unconfirmed past the window, A1 sees a site-level notice directing them to the bulletin board and the city page.
  - **Outcome:** An unmaintained site degrades into an honest one instead of a misleading one.
  - **Covered by:** R9, R10, R11

---

## Requirements

**Public experience**

- R1. The site is fully public. There is no visitor account, login, signup, or RSVP anywhere in the reading experience.
- R2. The landing view answers "what is happening at the center soon" — upcoming events in chronological order — with no navigation required.
- R3. Each event displays its name, date and time, location within the center, a short description, and who runs it when known.
- R4. The calendar represents both one-off events and recurring programs, so a weekly program is not re-entered every week.
- R5. The gallery presents active and past projects, each with photos, a short description, and a clear active/past status. Where a project has upcoming events, the project and those events link to each other.
- R5a. Gallery photos show spaces, structures, and work products. No identifiable individuals appear in v1 imagery.
- R6. Visitors can see events beyond the current week — a full forward calendar view, not only the next few days.
- R7. The phone is the primary form factor for both reading and posting; desktop is secondary.
- R8. The site displays the center's address and hours.

**Freshness and trust**

- R9. Every event displays a visitor-visible date indicating when its information was last confirmed against the bulletin board.
- R10. When an event has not been confirmed within the staleness window, the site presents it as unverified rather than as current information.
- R11. When no content on the site has been confirmed within the staleness window, visitors see a site-level notice pointing them to the physical bulletin board and the city/parks page.
- R12. The site states plainly that it is maintained by a neighborhood volunteer, is not the center's official website, and links to the official city/parks page. It names the physical bulletin board as the authoritative source.

**Maintainer workflow**

- R13. A single authenticated admin account is the only way to publish content. There is no self-registration.
- R14. Creating an event requires only a name and a date/time; every other field is optional, so a post can be completed in seconds from a phone.
- R15. The maintainer can attach a photo of a physical flyer to an event and publish with the photo standing in for a written description.
- R16. Confirming that an existing event is still accurate is a single action that refreshes its confirmation date without opening an edit form, and multiple events can be confirmed in one pass.

**Contributions from others**

- R17. Anyone can submit an event through a public form without an account.
- R18. Submitted events are never publicly visible until the maintainer approves them.
- R19. The submission form requires minimal fields and accepts a flyer photo in place of typed detail. Submitter contact info is optional.
- R20. The public submission form resists spam without requiring visitors to create accounts.
- R21. The maintainer has a queue of pending submissions and can approve, edit before approving, or reject each one.

**Ownership and handoff**

- R22. Site content is exportable and is not bound to the maintainer's personal identity, so the center can take ownership later without rebuilding.
- R23. v1 ships with exactly one publisher. This is a scope decision, not an architectural one: the design must not preclude adding additional publisher accounts later, but no roles, permissions, or invitation flows are built now.

---

## Acceptance Examples

- AE1. **Covers R9, R10.** Given an event scheduled for next Saturday whose information was last confirmed five weeks ago, when a visitor views it, the event is shown but flagged as unverified with its last-confirmed date visible — it is not silently presented as current.
- AE2. **Covers R11.** Given no content on the site has been confirmed within the staleness window, when any visitor loads any page, a site-level notice appears directing them to the bulletin board and the city/parks page.
- AE3. **Covers R17, R18.** Given a program director submits an event through the public form, when they immediately reload the public calendar, their event does not appear — it is visible only in the maintainer's pending queue.
- AE4. **Covers R14, R15.** Given the maintainer is signed in on a phone at the bulletin board, when they photograph a flyer and enter only an event name and date, the event publishes successfully with the photo attached and no description typed.
- AE5. **Covers R16.** Given six events already listed are still accurate, when the maintainer runs a confirmation pass, all six have refreshed confirmation dates without any of their fields being edited.
- AE6. **Covers R21.** Given a submitted event has the wrong start time, when the maintainer corrects it in the queue and approves, the corrected version publishes and the original submission is not shown publicly.

---

## Success Criteria

- The maintainer stops walking to the building to check what's on, because the site answers it.
- At least one neighbor who is not the maintainer discovers the site and attends something they learned about there.
- Three months after launch, the calendar is still accurate — or, if it isn't, the site is honestly telling visitors so rather than misinforming them.
- At least one program director or the community watch sends a schedule or uses the submission form. This is the signal that decides whether multi-publisher work is ever worth building; without it, v1 remains the whole product.
- Downstream planning can proceed without inventing product behavior: every requirement above has an observable behavior or a stated reason it is structural, and the exclusions below are explicit enough that scope does not drift back toward the original platform framing.

---

## Scope Boundaries

### Deferred for later

- Payments and donations of any kind, including the community garden. Revisited when the garden has a bank account and an accountable person named on it — a real-world prerequisite, not an engineering one.
- Membership: member accounts, dues, rosters, renewals. Deferred until someone at the center describes a member they are struggling to keep track of.
- Additional publisher accounts, roles, and permissions. Deferred until a program director asks for one.
- Email newsletters, notifications, and subscription blasts.
- Visitor-facing accounts of any kind, including RSVPs and attendance tracking.

### Outside this product's identity

- Program registration and facility or room booking. If the center is a city/parks facility, the city owns those flows and the money behind them; duplicating them would create a second source of truth for something with legal and financial consequences.
- Being or appearing to be the center's official website. The site is explicitly neighbor-maintained and points to the official page.
- Replacing the physical bulletin board. The board remains authoritative; the site mirrors it.
- A social layer — discussion, comments, profiles, messaging between neighbors. This is a way to find out what's happening, not a neighborhood network.

---

## Key Decisions

- Build the calendar and gallery first, ship them publicly, then add the submission queue: The calendar problem is the only verified need in this brainstorm. Everything else was a hypothesis about what the center wants, and none of those hypotheses has a person behind it yet.
- Contribution happens through an inbox, not an admin panel: Several program directors post to the board independently, none has asked for software, and none will learn a tool. A no-account form plus "text me a photo of your flyer" meets them where they already are. Onboarding four people into an admin system is the failure mode that kills volunteer-built community sites.
- Single admin (the maintainer), with no multi-user work in v1: The maintainer confirmed they will transcribe the board themselves regardless of whether anyone else participates. That makes every permission and role feature speculative.
- Freshness is a first-class feature: The site has a bus factor of one and depends on a volunteer who recently moved to the neighborhood. A stale calendar is worse than no calendar, because it actively misinforms. Making confirmation dates visible and degrading gracefully is what makes the site safe to leave running.
- Payments excluded from v1 despite being in the original request: Both candidate money flows are blocked on real-world questions, not code. Program fees likely belong to the city, and the garden's cash-and-check operation needs a bank account and an accountable owner before any online checkout is legitimate.
- Gallery photos exclude identifiable people in v1: A community center's projects involve residents and children, and the maintainer has no media release, no consent process, and no authority to grant one. Photographing spaces, garden beds, and finished work carries the same "this place is active" signal without needing anyone's permission. The policy can be loosened later if the center has a release practice.
- The site disclaims official status: The maintainer is volunteering with informal blessing and no formal owner on the center's side. Publishing a site that reads as official for a facility you have no authority over creates a problem for the center that a disclaimer and a link to the city page avoid cheaply.

---

## Dependencies / Assumptions

- The maintainer has regular physical access to the bulletin board. All content originates there; without proximity, the site has no input.
- Content volume is low — a handful of events per week. Nothing here is designed for scale, and that is deliberate.
- The center is assumed to be a city or parks-department facility, inferred from its presence on a city/parks page. Unverified. This assumption is what places program registration and fees outside scope.
- The community garden is assumed to be volunteer-run rather than a city program, based on it accepting cash and check in person. Unverified.
- Informal blessing to build is assumed to extend to publishing a public site. This has not been confirmed and is the subject of an outstanding question below.
- Project and event information posted on a public bulletin board is assumed to be freely republishable. Photographs of people are a separate question, below.

---

## Outstanding Questions

### Resolve Before Launch

*These do not block planning or implementation — the requirements are the same either way. They block making the site publicly reachable.*

- [Affects R12][User decision] Does anyone at the center — staff, a director, the board — know that a public site carrying the center's name is going up? Blessing to build is not blessing to publish, and this is a conversation to have before launch, not after.
- [Affects R8, R12][Needs research] Is the center in fact a city or parks-department facility, and does the city have policy governing third-party use of its facilities' names online? This determines whether the disclaimer in R12 is sufficient or whether explicit permission is needed.

### Deferred to Planning

- [Affects R9, R10, R11][User decision] What staleness window is right — how long may an event go unconfirmed before it is marked unverified? Depends on how often the maintainer realistically visits the board.
- [Affects R20][Technical] How to resist spam on a public, account-free submission form without adding visitor friction.
- [Affects R22][Technical] Hosting and domain ownership arrangement such that a future handoff to the center is possible without a rebuild.
- [Affects R4][Technical] How recurring programs are represented, including how a single occurrence gets cancelled or moved without disturbing the series.
- [Affects R16][Technical] What a multi-event confirmation pass looks like as an interaction.
