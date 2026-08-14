# Defining the Holiday Calendar

**Why this matters more than it looks.** The delta build persists holidays and
rewires the attendance block to read them. But an empty `Holiday` collection
behaves *identically* to the in-memory object it replaced — Sunday-only, with
every real holiday invisible, and festival absences still feeding parent truancy
alerts. **The fix is not live until a school populates its calendar.**

`validate-db` warns about this deliberately.

---

## Current state

| Route | Status |
|---|---|
| Bulk import from JSON or CSV | **Available now** |
| REST API (`/api/holidays`) | Designed, not built — BP-050 |
| Administrator calendar screens | Designed, not built — BP-060 |
| Year-end rollover of recurring holidays | Designed, not built — BP-033 |

Until BP-050 and BP-060 ship, bulk import is the route in.

---

## 1. Prepare the file

Copy a template:

```bash
cp database/seed/holidays.sample.json holidays.json
# or
cp database/seed/holidays.sample.csv holidays.csv
```

### Fields

| Field | Required | Notes |
|---|---|---|
| `label` | Yes | Shown to the teacher when marking is blocked — "Cannot mark attendance… (Diwali break)" |
| `date` | Yes | `yyyy-mm-dd`. First day |
| `endDate` | No | Last day of a multi-day break. Omit for a single day |
| `recurringAnnually` | No | Default `false`. See §2 — this one matters |
| `type` | No | Default `school`. One of `national`, `regional`, `religious`, `school`, `other` |

### A range is ONE entry

```json
{ "label": "Diwali break", "date": "2026-11-06", "endDate": "2026-11-12" }
```

Not seven entries. The calendar service expands the range on read.

---

## 2. `recurringAnnually` — the field to get right

This flag is the **only** thing year-end rollover carries forward. Everything
else must be re-entered each year.

**Set it `true`** only for holidays on the same calendar date every year:
Republic Day (26 Jan), Independence Day (15 Aug), Gandhi Jayanti (2 Oct),
Christmas (25 Dec), a school's founding day.

**Set it `false`** for anything that moves: Diwali, Holi, Eid, Dussehra,
Navratri, Onam, Good Friday — and for one-off closures, vacations and
weather days.

Marking a moving festival as recurring carries **last year's date** into next
year. The school then has a holiday recorded on a working day and no holiday on
the actual festival — silently reopening the exact defect this feature fixes.

The importer flags likely mistakes:

```
WARNING: these look like moving festivals but are marked recurringAnnually:
  Diwali break
  Their date changes each year, so rollover would carry the wrong date
  forward. Set recurringAnnually false unless the date is genuinely fixed.
```

---

## 3. Dry run first

```bash
./scripts/import-holidays.sh holidays.json --dry-run
```

```powershell
.\scripts\import-holidays.ps1 holidays.json -Extra "--dry-run"
```

Validates everything and writes nothing. Reports what would be added:

```
Parsed 10 entries from holidays.json
(DRY RUN — nothing will be written)

School 66f… — academic year 2026-27
    would add  2026-08-15  Independence Day  [recurring]
    would add  2026-11-06 .. 2026-11-12  Diwali break
  would insert: 10, already present: 0
```

### Validation rules

An entry is rejected, with its line number, when:

- `label` is missing
- `date` or `endDate` is not `yyyy-mm-dd`
- `endDate` precedes `date`
- `type` is not one of the five permitted values
- the date falls **outside the academic year** — otherwise the entry would sit
  in the collection and never be consulted
- it duplicates an earlier entry in the same file

Any error and **nothing** is imported for that school. Fix the file and re-run.

---

## 4. Import

```bash
./scripts/import-holidays.sh holidays.json
```

**Idempotent.** An entry matching an existing `{school, academicYear, label, date}`
is skipped, so re-running after adding a few rows is safe.

### Options

| Option | Effect |
|---|---|
| `--dry-run` | Validate and report; write nothing |
| `--school <id>` | One school. Default: every school with an active year |
| `--year <name>` | Target a specific academic year. Default: the active one |
| `--replace` | **Destructive.** Delete existing holidays for that year first |

`--replace` is never the default. Use it only to correct a bad import, and take
a backup first.

---

## 5. Verify

```bash
./scripts/validate-db.sh
```

The "no holidays are configured" warning should be gone.

Then confirm the behaviour end to end — this is the real test:

1. Log in as a teacher.
2. Try to mark attendance on an imported holiday date.
3. It should be **rejected** with `ATTENDANCE_BLOCKED_HOLIDAY` and the label.
4. Mark attendance on an ordinary weekday. It should still succeed.

Both halves matter. Blocking everything is as wrong as blocking nothing.

---

## 6. Direct database access

If you would rather not use the importer:

```javascript
db.holidays.insertOne({
  label: "Diwali break",
  date: ISODate("2026-11-06"),
  endDate: ISODate("2026-11-12"),
  recurringAnnually: false,
  type: "religious",
  school: ObjectId("<school id>"),
  academicYearId: ObjectId("<academic year id>"),
  createdAt: new Date(),
  updatedAt: new Date()
});
```

`school` and `academicYearId` are both required. A holiday with the wrong
`academicYearId` is never consulted. The importer resolves these for you, which
is the main reason to prefer it.

---

## 7. Half-days and exam days

A day where school is open but instruction is disrupted is a **SpecialEvent**,
not a Holiday:

```javascript
db.specialevents.insertOne({
  label: "Annual Exam Day",
  date: ISODate("2027-03-10"),
  attendanceRequired: true,      // students attend
  instructionSuspended: true,    // but normal instruction does not run
  category: "exam",
  school: ObjectId("<school id>"),
  academicYearId: ObjectId("<academic year id>"),
  createdAt: new Date(), updatedAt: new Date()
});
```

The two flags are independent. Only `instructionSuspended: true` makes the date
non-instructional for attendance and alert counting.

There is no bulk importer for special events yet — they are typically few, and
BP-050 will cover them.

---

## 8. When the UI arrives

BP-050 and BP-060 deliver `/settings/calendar` with list and grid views, holiday
and special-event forms with a repeat-annually control, and a rollover wizard.
At that point holidays are managed in the application and this importer becomes a
bulk-load convenience rather than the only route in.

Data imported now will appear in those screens unchanged — same collection, same
fields.
