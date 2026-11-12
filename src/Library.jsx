import React, { useState } from 'react';
import { BookOpen, Download, Search, Trash2, FileText } from 'lucide-react';
import { download } from './storage';

export default function Library({ notices, openNotice, removeNotice, newNotice }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [category, setCategory] = useState('All');
  const visible = notices.filter((notice) =>
    (category === 'All' || notice.category === category) &&
    (notice.title + ' ' + notice.text + ' ' + new Date(notice.updatedAt).toLocaleDateString()).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : b.updatedAt - a.updatedAt);

  return <div className="page">
    <div className="page-heading"><div><span className="eyebrow"><BookOpen size={17} />Your collection</span><h1>Saved notices</h1><p>Reopen corrected text and listen again. Saved on this device in this browser.</p></div>
      <button className="primary" onClick={newNotice}><FileText size={18} />New notice</button></div>
    <div className="library-layout"><section>
      <div className="card library-tools"><label className="search"><Search size={20} /><span className="sr-only">Search saved notices</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, date, or notice text…" /></label>
        <div className="button-row"><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{['All', 'Campus', 'Community', 'Personal', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Recently saved</option><option value="title">Alphabetical (A–Z)</option></select></label></div></div>
      <p className="result-count" role="status">{visible.length} {visible.length === 1 ? 'notice' : 'notices'} shown</p>
      <div className="library-cards">{visible.map((notice) => <article className="card saved-card" key={notice.id}>
        <div className="card-top"><span className="tag">{notice.category}</span><span className="muted">{new Date(notice.updatedAt).toLocaleDateString()}</span></div>
        <h2>{notice.title}</h2><p className="excerpt">{notice.text}</p>
        <div className="button-row"><button className="primary" onClick={() => openNotice(notice)}><BookOpen size={17} />Open in reader</button>
          <button aria-label={'Download ' + notice.title} onClick={() => download(notice.text, notice.title.replace(/[^a-z0-9 -]/gi, '').slice(0,80) + '.txt')}><Download size={18} />TXT</button>
          <button className="danger" aria-label={'Delete ' + notice.title} onClick={() => removeNotice(notice)}><Trash2 size={18} /></button></div>
      </article>)}</div>
      {!visible.length && <div className="card empty"><BookOpen size={40} /><h2>{notices.length ? 'No matching notices' : 'Your notices will appear here'}</h2><p>{notices.length ? 'Try another search or category.' : 'Scan a notice, check its text, then select Save Notice.'}</p><button onClick={newNotice}>Go to reader</button></div>}
    </section><aside className="card library-aside"><h2>Library details</h2><strong className="big-number">{notices.length}</strong><p>Saved {notices.length === 1 ? 'notice' : 'notices'}</p><hr /><h3>Local storage</h3><p>Images and corrected text are stored in this browser. Clearing site data removes your library. Private browsing may clear it when the window closes.</p>
      <button disabled={!notices.length} onClick={() => download(JSON.stringify(notices.map(({ image, original, ...notice }) => notice), null, 2), 'onepress-transcripts.json', 'application/json')}><Download size={18} />Export all transcripts</button>
      <p className="small">The JSON export includes notice titles, corrected text, and dates.</p></aside></div>
  </div>;
}
