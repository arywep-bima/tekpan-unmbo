// USER APP CODE
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

const ENV = (typeof window !== 'undefined' && window.__ENV__) || {};
const SUPABASE_URL = ENV.SUPABASE_URL || '';
const SUPABASE_KEY = ENV.SUPABASE_KEY || '';

let supabase = null;
try {
  if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch (e) {
  console.error('Supabase init failed:', e);
}

function safeQuery(table) {
  if (!supabase) {
    return {
      select: async () => ({ data: [] }),
      upsert: async () => ({})
    };
  }
  return supabase.from(table);
}

function useAIProctoring(onViolation){
  const videoRef = useRef(null);

  useEffect(()=>{
    if (typeof window === 'undefined') return;

    let interval;

    async function init(){
      try{
        if (!navigator.mediaDevices) {
          onViolation?.('NO_CAMERA');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if(videoRef.current){
          videoRef.current.srcObject = stream;
        }

        interval = setInterval(()=>{
          if (!document.hasFocus()) {
            onViolation?.('FOCUS_LOST');
          }
        }, 3000);

      }catch(e){
        console.warn('Camera error:', e);
        onViolation?.('CAMERA_ERROR');
      }
    }

    init();

    return ()=>{
      if(interval) clearInterval(interval);
    };
  },[onViolation]);

  return videoRef;
}

async function validateToken(token) {
  if (!supabase || !token) return false;

  try {
    const { data } = await supabase
      .from('exam_tokens')
      .select('student_name, used')
      .eq('token', token)
      .maybeSingle();

    if (!data || data.used) return false;

    await supabase
      .from('exam_tokens')
      .update({ used: true })
      .eq('token', token);

    return data.student_name;
  } catch (e) {
    console.error(e);
    return false;
  }
}

let lastSubmit = 0;
async function saveAnswer(student, questionId, answer) {
  if (!supabase) return;

  const now = Date.now();
  if (now - lastSubmit < 400) return;
  lastSubmit = now;

  try {
    await supabase.from('answers').upsert({
      student_name: student,
      question_id: questionId,
      answer
    }, { onConflict: 'student_name,question_id' });
  } catch (e) {
    console.error('Save error:', e);
  }
}

function ExamPage() {
  const [student, setStudent] = useState(null);
  const [violations, setViolations] = useState(0);

  const videoRef = useAIProctoring((reason)=>{
    console.warn('Violation:', reason);
    setViolations(v=>v+1);
  });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    validateToken(token).then(name => {
      if (!name) return alert('Token tidak valid');
      setStudent(name);
    });
  }, []);

  if (!student) return <div>Loading...</div>;

  return (
    <div>
      <h1>Ujian - {student}</h1>
      <p>Pelanggaran: {violations}</p>
      <video ref={videoRef} autoPlay muted playsInline width={220} />
      <button onClick={() => saveAnswer(student, 'Q1', 'A')}>
        Jawab A
      </button>
    </div>
  );
}

function Analytics() {
  const [data, setData] = useState([]);

  useEffect(() => {
    safeQuery('answers')
      .select('student_name')
      .then(res => {
        const scores = {};
        (res.data || []).forEach(r => {
          scores[r.student_name] = (scores[r.student_name] || 0) + 1;
        });
        setData(Object.entries(scores));
      });
  }, []);

  const top = useMemo(()=> [...data].sort((a,b)=>b[1]-a[1]).slice(0,100), [data]);

  return (
    <div>
      <h1>Ranking</h1>
      {top.map(([name, score], i) => (
        <div key={i}>{name} - {score}</div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/exam" element={<ExamPage />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </BrowserRouter>
  );
}
