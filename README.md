# Japan Auction Radar V1 Local Prototype

This is a local-only prototype for `japan-auction-radar.netlify.app`.

## Included
- Card-based case list
- Filters and sorting
- S/A/B/C/D rating display
- Gate logic concept: unresolved lease/occupancy/legal risks cap rating at B
- Case 294645 end-to-end prototype
- Six detail tabs
- Evidence table with manual override
- Manual case state persisted via browser `localStorage`
- Source failure history preserving last successful snapshot concept

## Not included yet
- Netlify Blobs persistence
- Netlify Functions
- Live scraping
- BIT PDF download
- OCR
- Scheduled updates
- Production deployment

## Run locally
```bash
python3 -m http.server 8787
```
Then open `http://127.0.0.1:8787/` from this folder.

## Netlify-ready data layer (not deployed)
Prepared against current Netlify Blobs/Functions conventions:
- `auction-cases` — current normalized case record
- `auction-snapshots` — append-style success/failure snapshots
- `auction-manual` — human overrides, kept separate from automatic extraction
- `auction-user-state` — personal workflow state

Critical behavior in `case-snapshot.mjs`:
- every attempt can create a snapshot
- only `result=success` is allowed to replace `cases/<id>/current`
- failures therefore cannot erase the last successful case record

The frontend first tries `/api/cases`; when running as a plain local static site it falls back to `data/cases.json`.

## V2.3 Drive-first ingestion

正式資料流：

1. 案件網址進入 `/api/ingest-case`
2. 找出三點件 PDF（物件明細書／現況調查報告書／評価書）
3. PDF 存入 Google Drive `02_三點件`
4. 從三點件抽取最大有效房屋照片作為主圖
5. 主圖 JPG 存入 Google Drive `03_案件主圖`
6. 同步主圖到 Netlify Blobs `auction-media/{caseId}/cover`
7. 首頁 `/api/property-image` 優先讀 Blobs，因此來源站日後 403 也不影響既有主圖
8. ingest 結果同步到 Netlify Blobs `auction-ingest/cases/{caseId}`

### Production folder IDs
- Root: `GDRIVE_ROOT_FOLDER_ID`
- Raw/case files: `GDRIVE_CASE_FILES_FOLDER_ID`
- Three docs: `GDRIVE_THREE_DOCS_FOLDER_ID`
- Images: `GDRIVE_IMAGES_FOLDER_ID`
- Analysis: `GDRIVE_ANALYSIS_FOLDER_ID`
- Index folder: `GDRIVE_INDEX_FOLDER_ID`
- Index workbook: `GDRIVE_INDEX_FILE_ID`

### Google Drive OAuth required for Netlify Functions
Netlify Functions cannot reuse ChatGPT's Drive connector session. Configure these **secret** environment variables in Netlify:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

Until those exist, `/api/ingest-case` returns `drive_not_configured` with the exact missing keys and any three-doc links it already discovered. It never deletes previous successful data.


## V2.4 BIT bundle-aware ingestion
- 競売公売.com 的「物件資料」可直接指向 BIT 一括三點件 PDF，例如 294645 -> courtId=33332 / saleUnitId=00000017213。
- `/api/ingest-case` 支援 BIT 一括 PDF 與三份分開 PDF。
- 同一案件重跑時，Drive 資料夾與同名檔案會 upsert，不重複堆副本。
- 成功時建立/更新原始檔、三點件、主圖、分析四層 Drive 資料。
- `GDRIVE_INDEX_FILE_ID` 指向原生 Google Sheet 時會自動 upsert `案件索引`。
