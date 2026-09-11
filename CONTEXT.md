# Freelancer Tools

Desktop app for a freelancer to record time worked for clients and turn that time into invoices.

## Language

**Client**:
A company the freelancer works for and bills. Every time entry belongs to exactly one Client.
_Avoid_: Company, customer, subject (Fakturoid's word), account

**Time Entry**:
A record of work done for one Client on one date, with a required duration and an optional start/end time. Duration is the billable fact; start/end only describe when it happened.
_Avoid_: Log, session, timesheet row, task

## Activity Tracking

**Activity Sample**:
One observation of which application and window had focus on the machine at a moment in time. Raw input, never shown as billable.
_Avoid_: Event, log line, tracking record

**Day Summary**:
What the machine observed on one calendar day, distilled on demand from Activity Samples: total active duration, a Tag breakdown of what was done, and a short LLM-written description. Cached once produced. Knows nothing about Clients.
_Avoid_: Report, analytics, activity log

**Suggestion**:
An on-demand, LLM-produced proposal for a Time Entry on one day: start, end, duration and a brief description, derived from that day's Activity Samples. Requested by the user with a button; the user picks the Client, accepts or tweaks the values, and only then does a Time Entry exist.
_Avoid_: Auto entry, draft entry, prediction

**Ignored App**:
An application the user has excluded from tracking. Time spent in it still counts as active, but neither its name nor its window titles are recorded.
_Avoid_: Blocklist, private app

**Tag**:
A label for a kind of work (e.g. "coding", "meetings") attached to portions of a Day Summary. Tags are created by the LLM as needed and reused across days from the existing list.
_Avoid_: Category, label, project, type

**Pensum**:
The share of a full workload the freelancer owes a Client, as a percentage (e.g. 80%). Together with the Client's Workday it yields the expected hours for any period.
_Avoid_: Allocation, FTE, capacity

**Workday**:
The number of hours in one full working day for a Client (e.g. 8.5). Only Monday to Friday count as workdays.
_Avoid_: Shift, day length

## Invoicing

**Hourly Rate**:
Price per hour of work, set per Client. The only pricing fact the app owns.
_Avoid_: Price, tariff, fee

**Invoice**:
A Fakturoid document created from a filtered list of Time Entries for one Client: one line, quantity = total hours exact to two decimals, at the Client's Hourly Rate. The app does not keep its own copy of the invoice or mark entries as billed; Fakturoid is the only record.
_Avoid_: Bill, billing run, statement

**Fakturoid Subject**:
The Client's counterpart in Fakturoid; identifies who the Invoice is addressed to.
_Avoid_: Customer, contact

**Fakturoid Generator**:
A Fakturoid invoice template whose invoice-level settings (currency, payment method, language, VAT mode, bank account, due days) are copied onto each Invoice for that Client.
_Avoid_: Template, preset
