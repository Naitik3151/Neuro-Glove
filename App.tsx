
import React, { useState, useEffect, useCallback } from 'react';
import LeftPanel from './components/LeftPanel';
import CenterPanel from './components/CenterPanel';
import * as services from './services';
import { DoctorInfo, LogEntry, ConnectionType } from './services';

// Inlined RightPanel component for code consolidation
const RightPanel: React.FC = () => {
  const uiStrings = services.getUIStrings('en'); // Static content
  return (
    <div className="bg-white rounded-xl p-4 shadow-lg hidden lg:block">
      <h3 className="font-bold text-lg mb-2">{uiStrings.quickInfoTitle}</h3>
      <p className="text-sm text-gray-600">{uiStrings.quickInfoDesc}</p>
      <div className="mt-4">
        <div className="font-bold mb-1.5">{uiStrings.notesTitle}</div>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
          {uiStrings.notesItems.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      </div>
    </div>
  );
};

// Main App component
export default function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [doctor, setDoctor] = useState<DoctorInfo | null>(null);
  const [connection, setConnection] = useState<ConnectionType>(ConnectionType.Disconnected);
  const [connectionDetails, setConnectionDetails] = useState<Record<string, any> | null>(null);
  const [language, setLanguage] = useState('en');

  const uiStrings = services.getUIStrings(language);

  const appendLog = useCallback((text: string, direction: 'in' | 'out') => {
    setLogs(prevLogs => [...prevLogs, { timestamp: new Date(), text, direction }]);
  }, []);

  useEffect(() => {
    // Initial demo messages
    setTimeout(() => appendLog('Device ready', 'in'), 800);
    setTimeout(() => appendLog('Hand open', 'in'), 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    services.init(appendLog, (connType, details) => {
      setConnection(connType);
      setConnectionDetails(details);
    });
    return () => { services.disconnect(); };
  }, [appendLog]);
  
  return (
    <div className="bg-gradient-to-b from-[#f3f7f7] to-white min-h-screen text-[#042a27] text-[0.95rem]">
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_320px] gap-5 items-start">
          <LeftPanel
            onDoctorFound={setDoctor}
            doctor={doctor}
            appendLog={appendLog}
            uiStrings={uiStrings}
          />
          <CenterPanel
            logs={logs}
            setLogs={setLogs}
            connection={connection}
            connectionDetails={connectionDetails}
            language={language}
            setLanguage={setLanguage}
            appendLog={appendLog}
            uiStrings={uiStrings}
          />
          <RightPanel />
        </div>
      </div>
    </div>
  );
}