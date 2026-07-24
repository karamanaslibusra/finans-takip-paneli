"use client";

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

export default function Dashboard() {
  const [transactions, setTransactions] = useState([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('EXPENSE');
  const [loading, setLoading] = useState(false);

 
  const fetchTransactions = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/transactions');
      if (res.ok) {
        const data = await res.json();
        const formatted = data.map((t) => ({
          ...t,
          id: String(t.id || t._id || Math.random()),
          amount: Math.abs(parseFloat(t.amount)) || 0,
          type: (t.type || 'EXPENSE').toUpperCase()
        }));
        setTransactions(formatted);
      }
    } catch (err) {
      console.log('Backend ulaşılamıyor:', err);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  
  const totalIncome = transactions
    .filter((t) => String(t.type).toUpperCase() === 'INCOME')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const totalExpense = transactions
    .filter((t) => String(t.type).toUpperCase() === 'EXPENSE')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const balance = totalIncome - totalExpense;

  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !amount) return;

    const numericAmount = Math.abs(parseFloat(amount));
    const newTx = {
      title,
      amount: numericAmount,
      type: type.toUpperCase()
    };

    try {
      setLoading(true);
      const res = await fetch('http://localhost:5000/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTx),
      });

      if (res.ok) {
        await fetchTransactions();
      } else {
        setTransactions((prev) => [...prev, { ...newTx, id: String(Date.now()) }]);
      }
    } catch (err) {
      setTransactions((prev) => [...prev, { ...newTx, id: String(Date.now()) }]);
    } finally {
      setTitle('');
      setAmount('');
      setLoading(false);
    }
  };

  
  const toggleType = (id) => {
    setTransactions((prev) =>
      prev.map((t) => {
        if (String(t.id) === String(id)) {
          const newType = String(t.type).toUpperCase() === 'INCOME' ? 'EXPENSE' : 'INCOME';
          return { ...t, type: newType };
        }
        return t;
      })
    );
  };

 
  const handleDelete = async (id) => {
    setTransactions((prev) => prev.filter((t) => String(t.id) !== String(id)));
    try {
      await fetch(`http://localhost:5000/api/transactions/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.log('Backend silme hatası:', err);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Tüm kayıtları silmek istediğinize emin misiniz?')) return;
    const currentItems = [...transactions];
    setTransactions([]);
    try {
      for (const t of currentItems) {
        if (t.id) {
          await fetch(`http://localhost:5000/api/transactions/${t.id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
    } catch (err) {
      console.log('Toplu silme hatası:', err);
    }
  };

  
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.pdf')) {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let extractedText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageItems = textContent.items.map((item) => item.str);
          extractedText += ' ' + pageItems.join(' ');
        }

        const numbers = extractedText.match(/\d+[.,]\d{2}/g) || [];

        if (numbers.length === 0) {
          alert('PDF okundu ancak tutar bulunamadı.');
          return;
        }

        const parsedTx = numbers.slice(0, 10).map((numStr, idx) => {
          const parsedVal = Math.abs(parseFloat(numStr.replace('.', '').replace(',', '.')));
          return {
            id: String(Date.now() + idx),
            title: `${file.name.replace('.pdf', '')} - İşlem #${idx + 1}`,
            amount: isNaN(parsedVal) ? 100 : parsedVal,
            type: idx % 3 === 0 ? 'INCOME' : 'EXPENSE', 
          };
        });

        setTransactions((prev) => [...prev, ...parsedTx]);
      } catch (err) {
        alert('Bu PDF dosyası okunamadı. Lütfen Excel (.xlsx) deneyin.');
      }
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const importedTransactions = data.map((row, index) => {
          const itemTitle = row['Açıklama'] || row['Açiklama'] || row['Title'] || row['Description'] || `İşlem #${index + 1}`;
          const rawAmount = parseFloat(row['Tutar'] || row['Amount'] || 0);
          const itemAmount = Math.abs(rawAmount);
          
          const rawType = (row['Tür'] || row['Tur'] || row['Type'] || '').toString().toUpperCase();
          const isIncome = rawAmount > 0 || rawType.includes('GELİR') || rawType.includes('INCOME') || rawType.includes('+');

          return {
            id: String(Date.now() + index),
            title: itemTitle,
            amount: itemAmount || 100,
            type: isIncome ? 'INCOME' : 'EXPENSE',
          };
        });

        setTransactions((prev) => [...prev, ...importedTransactions]);
      };
      reader.readAsBinaryString(file);
    }
    e.target.value = '';
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '40px 20px', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        
        {/* Başlık */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '28px', color: '#0f172a', fontWeight: '800', margin: 0 }}>
            💳 Finans Takip Paneli
          </h1>
          <p style={{ color: '#64748b', marginTop: '5px' }}>Gelir ve giderlerinizi canlı takip edin</p>
        </div>

        {/* Özet Kartları */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', borderLeft: '5px solid #22c55e' }}>
            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>TOPLAM GELİR</span>
            <p style={{ color: '#16a34a', fontSize: '24px', fontWeight: '700', margin: '8px 0 0 0' }}>+{totalIncome.toLocaleString('tr-TR')} ₺</p>
          </div>

          <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', borderLeft: '5px solid #ef4444' }}>
            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>TOPLAM GİDER</span>
            <p style={{ color: '#dc2626', fontSize: '24px', fontWeight: '700', margin: '8px 0 0 0' }}>-{totalExpense.toLocaleString('tr-TR')} ₺</p>
          </div>

          <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', borderLeft: `5px solid ${balance >= 0 ? '#3b82f6' : '#ef4444'}` }}>
            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>NET BAKİYE</span>
            <p style={{ color: balance >= 0 ? '#2563eb' : '#dc2626', fontSize: '24px', fontWeight: '700', margin: '8px 0 0 0' }}>{balance.toLocaleString('tr-TR')} ₺</p>
          </div>
        </div>

        <div style={{ background: '#eff6ff', border: '2px dashed #93c5fd', padding: '20px', borderRadius: '16px', textAlign: 'center', marginBottom: '30px' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#1e40af' }}>📄 Banka Ekstresi Yükle (PDF / Excel / CSV)</h4>
          <p style={{ fontSize: '13px', color: '#3b82f6', margin: '0 0 12px 0' }}>Bankanızdan indirdiğiniz `.pdf`, `.xlsx` veya `.csv` dosyasını seçin</p>
          <input 
            type="file" 
            accept=".pdf, .xlsx, .xls, .csv" 
            onChange={handleFileUpload} 
            style={{ cursor: 'pointer', fontSize: '14px' }}
          />
        </div>

        {/* Manuel Form */}
        <div style={{ background: '#ffffff', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#1e293b' }}>Manuel İşlem Ekle</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="Açıklama (Örn: Maaş, Market)" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              style={{ flex: '2', minWidth: '180px', padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
              required
            />
            <input 
              type="number" 
              placeholder="Tutar (₺)" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)}
              style={{ flex: '1', minWidth: '120px', padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
              required
            />
            <select 
              value={type} 
              onChange={(e) => setType(e.target.value)}
              style={{ flex: '1', minWidth: '110px', padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', background: '#fff' }}
            >
              <option value="EXPENSE">Gider (-)</option>
              <option value="INCOME">Gelir (+)</option>
            </select>
            <button 
              type="submit" 
              disabled={loading}
              style={{ padding: '12px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
            >
              Ekle
            </button>
          </form>
        </div>

        {/* İşlem Geçmişi */}
        <div style={{ background: '#ffffff', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#1e293b' }}>Son İşlemler</h3>
            {transactions.length > 0 && (
              <button 
                onClick={handleClearAll}
                style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                🧹 Tümünü Temizle
              </button>
            )}
          </div>

          {transactions.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', margin: '20px 0' }}>Henüz kayıtlı bir işlem yok.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {transactions.map((t) => {
                const isIncome = String(t.type).toUpperCase() === 'INCOME';
                return (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px' }}>
                    <span style={{ fontWeight: '500', color: '#334155' }}>{t.title || t.description}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      
                      {/* 🟢/🔴 Gelir-Gider Türü Değiştirici Buton */}
                      <button
                        onClick={() => toggleType(t.id)}
                        style={{
                          background: isIncome ? '#dcfce7' : '#fee2e2',
                          color: isIncome ? '#15803d' : '#b91c1c',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        {isIncome ? '🟢 GELİR (+)' : '🔴 GİDER (-)'}
                      </button>

                      <span style={{ fontWeight: '700', color: isIncome ? '#16a34a' : '#dc2626', minWidth: '90px', textAlign: 'right' }}>
                        {isIncome ? '+' : '-'}{(parseFloat(t.amount) || 0).toLocaleString('tr-TR')} ₺
                      </span>

                      <button 
                        onClick={() => handleDelete(t.id)}
                        title="Sil"
                        style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}