import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, getDocs, doc, updateDoc, addDoc, query, where, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import './Dashboard.css';
import logoCSL from '../assets/logo-CSL.png';
import homeScreenBg from '../assets/Home-Screen.jpg';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { FileUp, Keyboard } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

function Dashboard() {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const [showContent, setShowContent] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [popupMode, setPopupMode] = useState('selection'); 
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: '',
    height: '',
    weight: '',
    bmi: ''
  });

  const [clinicalParams, setClinicalParams] = useState({
    nfatc3: '',
    dm: '',
    proBNP: '',
    ef: '',
    gls: ''
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modelResults, setModelResults] = useState(null);

  const [showResults, setShowResults] = useState(false);


  const [activeTab, setActiveTab] = useState('home');
  const [trackedUsersData, setTrackedUsersData] = useState([]);
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [notification, setNotification] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowContent(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const calculateBMI = (height, weight) => {
    if (!height || !weight) return '';
    const heightInMeters = height / 100;
    const bmi = (weight / (heightInMeters * heightInMeters)).toFixed(1);
    return bmi;
  };


  const getBMICategory = (bmi) => {
    if (!bmi || bmi === '') return { category: '', range: '', isHighlighted: false };

    const bmiValue = parseFloat(bmi);
    if (bmiValue < 18.5) {
      return { category: 'Underweight', range: 'Below 18.5', isHighlighted: true };
    } else if (bmiValue >= 18.5 && bmiValue <= 24.9) {
      return { category: 'Normal weight', range: '18.5-24.9', isHighlighted: true };
    } else if (bmiValue >= 25 && bmiValue <= 29.9) {
      return { category: 'Overweight', range: '25-29.9', isHighlighted: true };
    } else {
      return { category: 'Obese', range: '30 and higher', isHighlighted: true };
    }
  };

  const processExtractedText = (text) => {
    const newFormData = { ...formData };
    const newClinicalParams = { ...clinicalParams };

   
    const findValue = (patterns) => {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) return match[1].trim();
      }
      return null;
    };

    // Patient Info
    const age = findValue([/Age[:\s]+(\d+)/i, /Age\s+(\d+)/i]);
    if (age) newFormData.age = age;

    const gender = text.match(/Sex[:\s]+(Male|Female)|Gender[:\s]+(Male|Female)|(Male|Female)/i);
    if (gender) newFormData.gender = gender[1] || gender[2] || gender[3];

    const height = findValue([/Height[:\s]+(\d+)/i, /Height\s+(\d+)/i]);
    if (height) newFormData.height = height;

    const weight = findValue([/Weight[:\s]+(\d+)/i, /Weight\s+(\d+)/i]);
    if (weight) newFormData.weight = weight;

    // Clinical Parameters
    const nfatc3 = findValue([/NFATC3[:\s]+([\d.]+)/i, /NFATC3\s+([\d.]+)/i]);
    if (nfatc3) newClinicalParams.nfatc3 = nfatc3;

    // DM - Diabetes Mellitus
    // Check for "Absent" or "Present" or "Yes" or "No"
    const dmMatch = text.match(/Diabetes\s*Mellitus[:\s]+(Absent|Present|Yes|No)/i);
    if (dmMatch) {
      const val = dmMatch[1].toLowerCase();
      newClinicalParams.dm = (val === 'present' || val === 'yes') ? '1' : '0';
    } else {
      
      const dmNum = findValue([/DM[:\s]+([\d.]+)/i]);
      if (dmNum) newClinicalParams.dm = dmNum;
    }


    const gls = findValue([/GLS[:\s]+(-?[\d.]+)/i, /GLS\s+(-?[\d.]+)/i]);
    if (gls) newClinicalParams.gls = gls;


    const ef = findValue([/Ejection\s*Fraction\s*\(LVEF\)[:\s]+(\d+)/i, /LVEF[:\s]+(\d+)/i, /EF[:\s]+(\d+)/i]);
    if (ef) newClinicalParams.ef = ef;

    const probnp = findValue([/NT-proBNP[:\s]+([\d.]+)/i, /proBNP[:\s]+([\d.]+)/i]);
    if (probnp) newClinicalParams.proBNP = probnp;

    // Auto-calculate BMI 
    if (newFormData.height && newFormData.weight) {
      newFormData.bmi = calculateBMI(newFormData.height, newFormData.weight);
    } else {
      const bmi = findValue([/BMI[:\s]+([\d.]+)/i]);
      if (bmi) newFormData.bmi = bmi;
    }

    setFormData(newFormData);
    setClinicalParams(newClinicalParams);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessingOCR(true);
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          text += textContent.items.map(item => item.str).join(' ') + ' ';
        }
      } else {
        const result = await Tesseract.recognize(
          file,
          'eng',
          { logger: m => console.log(m) }
        );
        text = result.data.text;
      }

      console.log('Extracted Text:', text);
      processExtractedText(text);
      setPopupMode('form');
    } catch (error) {
      console.error('OCR Error:', error);
      alert('Failed to process document. Please try again or enter manually.');
    } finally {
      setIsProcessingOCR(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };

      if (name === 'bmi') {
        if (value) {
          newData.height = '';
          newData.weight = '';
        }
      }

      if (name === 'height' || name === 'weight') {
        const height = name === 'height' ? value : prev.height;
        const weight = name === 'weight' ? value : prev.weight;

        if (height && weight) {
          newData.bmi = calculateBMI(height, weight);
        } else {
          newData.bmi = '';
        }
      }

      return newData;
    });
  };

  const handleClinicalParamChange = (e) => {
    const { name, value } = e.target;
    setClinicalParams(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAnalyze = async () => {

    if (!formData.name.trim()) {
      alert('Please enter your name');
      return;
    }
    if (!formData.age || formData.age <= 0) {
      alert('Please enter a valid age');
      return;
    }
    if (!formData.gender) {
      alert('Please select your gender');
      return;
    }


    const hasHeightWeight = formData.height && formData.weight && formData.height > 0 && formData.weight > 0;
    const hasBMI = formData.bmi && parseFloat(formData.bmi) > 0;

    if (!hasHeightWeight && !hasBMI) {
      alert('Please enter either Height & Weight OR BMI');
      return;
    }

    setIsAnalyzing(true);
    setModelResults(null);

    try {
      const dataToAnalyze = {
        name: formData.name,
        age: formData.age,
        gender: formData.gender,
        height: formData.height ? parseFloat(formData.height) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        bmi: parseFloat(formData.bmi),
        clinicalParameters: {
          nfatc3: clinicalParams.nfatc3 || 'Not Available',
          dm: clinicalParams.dm || 'Not Available',
          proBNP: clinicalParams.proBNP || 'Not Available',
          ef: clinicalParams.ef || 'Not Available',
          gls: clinicalParams.gls || 'Not Available'
        }
      };

      const response = await fetch('https://cardiac-api-nyu5ktt44a-uc.a.run.app/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToAnalyze),
      });

      const data = await response.json();

      if (data.error) {
        alert(`Analysis failed: ${data.message}`);
        console.error('Error:', data);
      } else {
        setModelResults(data);
        setShowResults(true);
        setShowPopup(false);
        console.log('Model results:', data);
      }
    } catch (error) {
      console.error('Error during analysis:', error);
      alert('Failed to analyze data. Please try again later.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentUser) {
      alert('Please log in to save your profile');
      return;
    }


    if (!formData.name.trim()) {
      alert('Please enter your name');
      return;
    }
    if (!formData.age || formData.age <= 0) {
      alert('Please enter a valid age');
      return;
    }
    if (!formData.gender) {
      alert('Please select your gender');
      return;
    }


    const hasHeightWeight = formData.height && formData.weight && formData.height > 0 && formData.weight > 0;
    const hasBMI = formData.bmi && parseFloat(formData.bmi) > 0;

    if (!hasHeightWeight && !hasBMI) {
      alert('Please enter either Height & Weight OR BMI');
      return;
    }

    setIsSaving(true);

    try {
      const userProfileData = {
        name: formData.name,
        age: formData.age,
        gender: formData.gender,
        height: formData.height ? parseFloat(formData.height) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        bmi: parseFloat(formData.bmi),
        bmiCategory: getBMICategory(formData.bmi).category,
        clinicalParameters: {
          nfatc3: clinicalParams.nfatc3 || 'Not Available',
          dm: clinicalParams.dm || 'Not Available',
          proBNP: clinicalParams.proBNP || 'Not Available',
          ef: clinicalParams.ef || 'Not Available',
          gls: clinicalParams.gls || 'Not Available'
        },
        modelResults: modelResults || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: currentUser.uid
      };

      console.log('Attempting to save to Firestore...');
      console.log('User UID:', currentUser.uid);
      console.log('Data to save:', userProfileData);


      const profilesRef = collection(db, 'userProfiles');
      const docRef = await addDoc(profilesRef, userProfileData);

      console.log('✅ Profile saved successfully to Firestore!');
      console.log('Document ID:', docRef.id);
      console.log('Saved data:', userProfileData);

      setNotification({ message: 'Profile saved successfully! Go to "Track User" to view details.', type: 'success' });
      setTimeout(() => setNotification(null), 5000);
      setShowPopup(false);
      setShowResults(false);
      setModelResults(null);

      setFormData({
        name: '',
        age: '',
        gender: '',
        height: '',
        weight: '',
        bmi: ''
      });

      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving profile:', error);
      alert(`Error saving profile: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };



  const handleClosePopup = () => {
    setShowPopup(false);
    setFormData({
      name: '',
      age: '',
      gender: '',
      height: '',
      weight: '',
      bmi: ''
    });
    setClinicalParams({
      nfatc3: '',
      dm: '',
      proBNP: '',
      ef: '',
      gls: ''
    });
    setClinicalParams({
      nfatc3: '',
      dm: '',
      proBNP: '',
      ef: '',
      gls: ''
    });
    setModelResults(null);
    setPopupMode('selection');
  };

  const handleCloseResults = () => {
    setShowResults(false);
    setModelResults(null);
    setFormData({
      name: '',
      age: '',
      gender: '',
      height: '',
      weight: '',
      bmi: ''
    });
    setClinicalParams({
      nfatc3: '',
      dm: '',
      proBNP: '',
      ef: '',
      gls: ''
    });
  };

  async function handleLogout() {
    try {
      await logout();
      navigate('/signin', { state: { skipAnimation: true } });
    } catch (error) {
      console.error('Failed to log out', error);
    }
  }

  const fetchUserData = async () => {
    if (!currentUser) return;
    setIsLoadingData(true);
    try {
      const profiles = [];
      console.log('Fetching data for user:', currentUser.uid);


      try {
        const legacyRef = doc(db, 'userProfiles', currentUser.uid);
        const legacySnap = await getDoc(legacyRef);

        if (legacySnap.exists()) {
          console.log('Legacy profile found');
          profiles.push({ id: legacySnap.id, ...legacySnap.data() });
        }
      } catch (err) {
        console.warn('Error fetching legacy profile:', err);
      }

      try {
        const profilesRef = collection(db, 'userProfiles');
        const q = query(profilesRef, where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((doc) => {
          if (doc.id !== currentUser.uid) {
            profiles.push({ id: doc.id, ...doc.data() });
          }
        });
      } catch (err) {
        console.warn('Error querying additional profiles:', err);
      }

      profiles.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateB - dateA;
      });

      console.log('Final tracked profiles:', profiles);
      setTrackedUsersData(profiles);
    } catch (error) {
      console.error("Critical error fetching user data:", error);
      alert("Failed to load user data: " + error.message);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'track-user' || tab === 'profile') {
      fetchUserData();
      setShowContent(false);
    } else if (tab === 'home') {
      setTimeout(() => setShowContent(true), 100);
    }
  };

  const toggleCardExpansion = (userId) => {
    setExpandedCardId(expandedCardId === userId ? null : userId);
  };

  return (
    <div className="dashboard-container" style={{ backgroundImage: `url(${homeScreenBg})` }}>
      {notification && (
        <div className={`notification-toast ${notification.type}`}>
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}
      <div className="dashboard-overlay">
        <nav className="navbar">
          <div className="nav-logo">
            <img src={logoCSL} alt="Cardiac Strain Labs" className="logo-img" />
          </div>
          <div className="nav-links">
            <a href="#home" onClick={(e) => { e.preventDefault(); handleTabChange('home'); }} className="nav-link">Home</a>
            <a href="#add-user" onClick={(e) => { e.preventDefault(); setShowPopup(true); setPopupMode('form'); }} className="nav-link">Add User</a>
            <a href="#track-user" onClick={(e) => { e.preventDefault(); handleTabChange('track-user'); }} className="nav-link">Track User</a>
            <a href="#vision" onClick={(e) => { e.preventDefault(); handleTabChange('vision'); }} className="nav-link">Our Vision</a>
            <button onClick={handleLogout} className="nav-link logout-btn">Logout</button>
          </div>
        </nav>

        <div className="main-content">
          {activeTab === 'home' && (
            <div className={`content-text ${showContent ? 'animate-in' : ''}`}>
              <h1 className="main-heading">AI-Powered Cardiac Care</h1>
              <h2 className="sub-heading">from innovation to impact</h2>
              <p className="description">
                we propose a Large Language Model (LLM)–informed, AI-driven heart health system that integrates clinical precision with public accessibility.
              </p>
              <button className="try-it-btn" onClick={() => { setShowPopup(true); setPopupMode('selection'); }}>
                Try it Out
              </button>
            </div>
          )}

          {activeTab === 'vision' && (
            <div className="vision-container animate-in">
              <h2 className="vision-heading">Our Vision</h2>

              <div className="vision-details">
                <p>
                  Our mission is to democratize advanced cardiac diagnostics by leveraging the power of Artificial Intelligence. By combining state-of-the-art computer vision for strain analysis with the reasoning capabilities of Large Language Models, we aim to provide early, accurate, and accessible heart health insights to everyone, everywhere.
                </p>
                <p>
                  We envision a future where cardiac care is proactive rather than reactive, bridging the gap between complex clinical data and actionable patient understanding.
                </p>
              </div>
            </div>
          )}





          {activeTab === 'track-user' && (
            <div className="track-user-container">
              <h2 className="section-title white-text">Track User Data</h2>
              {isLoadingData ? (
                <div className="loading-spinner">Loading...</div>
              ) : trackedUsersData.length > 0 ? (
                <div className="users-list">
                  {trackedUsersData.map((userData) => (
                    <div key={userData.id} className={`user-card ${expandedCardId === userData.id ? 'expanded' : ''}`}>
                      <div className="card-header">
                        <div className="card-summary" onClick={() => toggleCardExpansion(userData.id)}>
                          <h3>{userData.name}</h3>
                          <p>Age: {userData.age}</p>
                          <p>BMI Category: <span className={`bmi-tag ${userData.bmiCategory?.toLowerCase().replace(' ', '-')}`}>{userData.bmiCategory || 'N/A'}</span></p>
                        </div>
                        <div className="card-actions">
                          <div className="card-expand-icon" onClick={(e) => { e.stopPropagation(); toggleCardExpansion(userData.id); }}>
                            {expandedCardId === userData.id ? '▲' : '▼'}
                          </div>
                        </div>
                      </div>

                      <div className={`card-details ${expandedCardId === userData.id ? 'expanded' : ''}`}>
                        {editingUserId === userData.id ? (
                          <div className="card-edit-form">
                            <div className="form-row">
                              <div className="form-group">
                                <label className="form-label">Height (cm)</label>
                                <input type="number"
                                  className="form-input"
                                  value={editFormData.height || ''}
                                  onChange={(e) => setEditFormData({ ...editFormData, height: e.target.value })}
                                  disabled={!!editFormData.bmi && parseFloat(editFormData.bmi) > 0}
                                />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Weight (kg)</label>
                                <input type="number"
                                  className="form-input"
                                  value={editFormData.weight || ''}
                                  onChange={(e) => setEditFormData({ ...editFormData, weight: e.target.value })}
                                  disabled={!!editFormData.bmi && parseFloat(editFormData.bmi) > 0}
                                />
                              </div>
                            </div>

                            <div className="or-separator">
                              <span className="or-text">OR</span>
                            </div>

                            <div className="form-row" style={{ marginBottom: '20px' }}>
                              <div className="form-group">
                                <label className="form-label">BMI</label>
                                <input type="number"
                                  className="form-input"
                                  value={editFormData.bmi || ''}
                                  onChange={(e) => setEditFormData({ ...editFormData, bmi: e.target.value })}
                                  disabled={!!(editFormData.height && editFormData.weight)}
                                />
                              </div>
                            </div>

                            <div className="clinical-grid-edit" style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
                              <div className="form-row">
                                <div className="form-group">
                                  <label className="form-label">NFATc3</label>
                                  <input type="text" className="form-input" value={editFormData.clinicalParameters?.nfatc3 || ''} onChange={(e) => setEditFormData({ ...editFormData, clinicalParameters: { ...editFormData.clinicalParameters, nfatc3: e.target.value } })} />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">DM</label>
                                  <input type="text" className="form-input" value={editFormData.clinicalParameters?.dm || ''} onChange={(e) => setEditFormData({ ...editFormData, clinicalParameters: { ...editFormData.clinicalParameters, dm: e.target.value } })} />
                                </div>
                              </div>
                              <div className="form-row">
                                <div className="form-group">
                                  <label className="form-label">ProBNP</label>
                                  <input type="text" className="form-input" value={editFormData.clinicalParameters?.proBNP || ''} onChange={(e) => setEditFormData({ ...editFormData, clinicalParameters: { ...editFormData.clinicalParameters, proBNP: e.target.value } })} />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">EF</label>
                                  <input type="text" className="form-input" value={editFormData.clinicalParameters?.ef || ''} onChange={(e) => setEditFormData({ ...editFormData, clinicalParameters: { ...editFormData.clinicalParameters, ef: e.target.value } })} />
                                </div>
                              </div>
                              <div className="form-group">
                                <label className="form-label">GLS</label>
                                <input type="text" className="form-input" value={editFormData.clinicalParameters?.gls || ''} onChange={(e) => setEditFormData({ ...editFormData, clinicalParameters: { ...editFormData.clinicalParameters, gls: e.target.value } })} />
                              </div>
                            </div>

                            <div className="form-actions" style={{ marginTop: '30px' }}>
                              <button type="button" className="cancel-btn" onClick={(e) => { e.stopPropagation(); setEditingUserId(null); }}>
                                Cancel
                              </button>
                              <button type="button" className="analyze-btn" onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  setIsLoadingData(true);
                                  let newBMI = editFormData.bmi;
                                  let newBMICategory = editFormData.bmiCategory;
                                  if (editFormData.height && editFormData.weight) {
                                    const h = parseFloat(editFormData.height) / 100;
                                    const w = parseFloat(editFormData.weight);
                                    newBMI = (w / (h * h)).toFixed(1);
                                    newBMICategory = getBMICategory(newBMI).category;
                                  }

                                  const updatedData = {
                                    ...editFormData,
                                    bmi: newBMI,
                                    bmiCategory: newBMICategory,
                                    updatedAt: new Date().toISOString()
                                  };

                                  const profileRef = doc(db, 'userProfiles', userData.id);
                                  await updateDoc(profileRef, updatedData);

                                  setTrackedUsersData(trackedUsersData.map(u =>
                                    u.id === userData.id ? { ...u, ...updatedData } : u
                                  ));
                                  setEditingUserId(null);
                                  setNotification({ message: 'Profile updated successfully!', type: 'success' });
                                  setTimeout(() => setNotification(null), 3000);
                                } catch (err) {
                                  console.error(err);
                                  alert('Failed to update');
                                } finally {
                                  setIsLoadingData(false);
                                }
                              }}>
                                Save Profile
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="view-details">
                            <div className="detail-section">
                              <h4>Physical Metrics</h4>
                              <div className="detail-grid">
                                <div className="detail-item">
                                  <span className="label">Height:</span>
                                  <span className="value">{userData.height || 'N/A'} cm</span>
                                </div>
                                <div className="detail-item">
                                  <span className="label">Weight:</span>
                                  <span className="value">{userData.weight || 'N/A'} kg</span>
                                </div>
                                <div className="detail-item">
                                  <span className="label">BMI:</span>
                                  <span className="value">{userData.bmi}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="label">Gender:</span>
                                  <span className="value">{userData.gender}</span>
                                </div>
                              </div>
                            </div>

                            <div className="detail-section">
                              <h4>Clinical Parameters</h4>
                              <div className="detail-grid">
                                <div className="detail-item">
                                  <span className="label">NFATc3:</span>
                                  <span className="value">{userData.clinicalParameters?.nfatc3 || 'N/A'}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="label">DM:</span>
                                  <span className="value">{userData.clinicalParameters?.dm || 'N/A'}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="label">proBNP:</span>
                                  <span className="value">{userData.clinicalParameters?.proBNP || 'N/A'}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="label">EF:</span>
                                  <span className="value">{userData.clinicalParameters?.ef || 'N/A'}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="label">GLS:</span>
                                  <span className="value">{userData.clinicalParameters?.gls || 'N/A'}</span>
                                </div>
                              </div>
                            </div>

                            {userData.modelResults && (
                              <div className="detail-section">
                                <h4>Analysis Results</h4>
                                <div className="detail-grid">
                                  <div className="detail-item">
                                    <span className="label">Risk Score:</span>
                                    <span className="value">{userData.modelResults.risk_score?.toFixed(2)}</span>
                                  </div>
                                  <div className="detail-item">
                                    <span className="label">Prediction:</span>
                                    <span className="value">{userData.modelResults.prediction}</span>
                                  </div>
                                  <div className="detail-item full-width">
                                    <span className="label">Recommendation:</span>
                                    <span className="value">{userData.modelResults.recommendation}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="last-updated">
                              Last Updated: {new Date(userData.updatedAt).toLocaleString()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-data-message">
                  <p>No user data found. Please add a user profile first.</p>
                  <button className="try-it-btn" onClick={() => setShowPopup(true)}>Add User</button>
                </div>
              )}
            </div>
          )}

          {showPopup && (
            <div className="popup-overlay" onClick={handleClosePopup}>
              <div className="popup-content" onClick={(e) => e.stopPropagation()}>
                <div className="popup-header">
                  <h2 className="popup-title">
                    {popupMode === 'selection' ? 'Choose Input Method' : 'Add User Profile'}
                  </h2>
                  <button className="close-btn" onClick={handleClosePopup}>×</button>
                </div>

                {popupMode === 'selection' ? (
                  <div className="selection-container">
                    <label className="selection-card">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileUpload}
                        className="file-input-hidden"
                      />
                      <FileUp className="selection-icon" size={48} />
                      <h3>Upload Document</h3>
                      <p>Upload a PDF or Image</p>
                      {isProcessingOCR && <p style={{ color: '#667eea', marginTop: '10px' }}>Processing...</p>}
                    </label>
                    <div className="selection-card" onClick={() => setPopupMode('form')}>
                      <Keyboard className="selection-icon" size={48} />
                      <h3>Enter Manually</h3>
                      <p>Fill out the form yourself</p>
                    </div>
                  </div>
                ) : (
                  <form className="popup-form" onSubmit={handleSubmit}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">
                          Name <span className="required-asterisk">*</span>
                        </label>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          className="form-input"
                          required
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">
                          Age <span className="required-asterisk">*</span>
                        </label>
                        <input
                          type="text"
                          name="age"
                          value={formData.age}
                          onChange={handleInputChange}
                          className="form-input"
                          placeholder="Enter age"
                          required
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">
                          Gender <span className="required-asterisk">*</span>
                        </label>
                        <div className="radio-group">
                          <label className="radio-option">
                            <input
                              type="radio"
                              name="gender"
                              value="Male"
                              checked={formData.gender === 'Male'}
                              onChange={handleInputChange}
                              className="radio-input"
                            />
                            <span className="radio-label">Male</span>
                          </label>
                          <label className="radio-option">
                            <input
                              type="radio"
                              name="gender"
                              value="Female"
                              checked={formData.gender === 'Female'}
                              onChange={handleInputChange}
                              className="radio-input"
                            />
                            <span className="radio-label">Female</span>
                          </label>
                          <label className="radio-option">
                            <input
                              type="radio"
                              name="gender"
                              value="Prefer not to say"
                              checked={formData.gender === 'Prefer not to say'}
                              onChange={handleInputChange}
                              className="radio-input"
                            />
                            <span className="radio-label">Prefer not to say</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">
                          Height (cm) {!formData.bmi && <span className="required-asterisk">*</span>}
                        </label>
                        <input
                          type="number"
                          name="height"
                          value={formData.height}
                          onChange={handleInputChange}
                          className="form-input"
                          placeholder="e.g., 175"
                          disabled={!!(formData.bmi && !formData.height && !formData.weight)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">
                          Weight (kg) {!formData.bmi && <span className="required-asterisk">*</span>}
                        </label>
                        <input
                          type="number"
                          name="weight"
                          value={formData.weight}
                          onChange={handleInputChange}
                          className="form-input"
                          placeholder="e.g., 70"
                          disabled={!!(formData.bmi && !formData.height && !formData.weight)}
                        />
                      </div>
                    </div>

                    <div className="or-separator">
                      <span className="or-text">OR</span>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">
                          BMI {!formData.height && !formData.weight && <span className="required-asterisk">*</span>}
                        </label>
                        <input
                          type="text"
                          name="bmi"
                          value={formData.bmi}
                          onChange={handleInputChange}
                          className="form-input"
                          placeholder="Enter BMI directly"
                          disabled={!!(formData.height || formData.weight)}
                        />
                      </div>
                    </div>

                    {formData.bmi && parseFloat(formData.bmi) > 0 && (
                      <div className="bmi-chart-container">
                        <h4 className="bmi-chart-title">BMI Categories</h4>
                        <div className="bmi-chart">
                          <div className={`bmi-category ${getBMICategory(formData.bmi).category === 'Underweight' ? 'highlighted' : ''}`}>
                            <div className="bmi-category-name">Underweight</div>
                            <div className="bmi-category-range">Below 18.5</div>
                          </div>
                          <div className={`bmi-category ${getBMICategory(formData.bmi).category === 'Normal weight' ? 'highlighted' : ''}`}>
                            <div className="bmi-category-name">Normal weight</div>
                            <div className="bmi-category-range">18.5-24.9</div>
                          </div>
                          <div className={`bmi-category ${getBMICategory(formData.bmi).category === 'Overweight' ? 'highlighted' : ''}`}>
                            <div className="bmi-category-name">Overweight</div>
                            <div className="bmi-category-range">25-29.9</div>
                          </div>
                          <div className={`bmi-category ${getBMICategory(formData.bmi).category === 'Obese' ? 'highlighted' : ''}`}>
                            <div className="bmi-category-name">Obese</div>
                            <div className="bmi-category-range">30 and higher</div>
                          </div>
                        </div>
                        <div className="bmi-disclaimer">
                          Note: The BMI may not be accurate for people with greater muscle mass (such as athletes) or in older people and others who have lost muscle mass.
                        </div>
                      </div>
                    )}

                    <div className="non-editable-section">
                      <h3 className="section-title">Non-Clinical Parameters</h3>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">NFATc3</label>
                          <input
                            type="text"
                            name="nfatc3"
                            value={clinicalParams.nfatc3}
                            onChange={handleClinicalParamChange}
                            className="form-input"
                            placeholder="Enter NFATc3 value"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">DM</label>
                          <input
                            type="text"
                            name="dm"
                            value={clinicalParams.dm}
                            onChange={handleClinicalParamChange}
                            className="form-input"
                            placeholder="Enter DM value"
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">proBNP</label>
                          <input
                            type="text"
                            name="proBNP"
                            value={clinicalParams.proBNP}
                            onChange={handleClinicalParamChange}
                            className="form-input"
                            placeholder="Enter proBNP value"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">EF</label>
                          <input
                            type="text"
                            name="ef"
                            value={clinicalParams.ef}
                            onChange={handleClinicalParamChange}
                            className="form-input"
                            placeholder="Enter EF value"
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">GLS</label>
                          <input
                            type="text"
                            name="gls"
                            value={clinicalParams.gls}
                            onChange={handleClinicalParamChange}
                            className="form-input"
                            placeholder="Enter GLS value"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="form-actions">
                      <button type="button" className="cancel-btn" onClick={handleClosePopup}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="analyze-btn"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                      >
                        {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {showResults && modelResults && (
            <div className="popup-overlay" onClick={handleCloseResults}>
              <div className="popup-content" onClick={(e) => e.stopPropagation()}>
                <div className="popup-header">
                  <h2 className="popup-title">Analysis Results</h2>
                  <button className="close-btn" onClick={handleCloseResults}>×</button>
                </div>

                <div className="popup-form">
                  <div className="user-info-summary">
                    <h3 className="section-title">Patient Information</h3>
                    <div className="info-grid">
                      <div className="info-item">
                        <span className="info-label">Name:</span>
                        <span className="info-value">{formData.name}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Age:</span>
                        <span className="info-value">{formData.age} years</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Gender:</span>
                        <span className="info-value">{formData.gender}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">BMI:</span>
                        <span className="info-value">{formData.bmi}</span>
                      </div>
                    </div>
                  </div>

                  <div className="analysis-results">
                    <h3 className="results-title">Model Predictions</h3>
                    <div className="results-grid">
                      {modelResults.risk_score !== undefined && (
                        <div className="result-item">
                          <span className="result-label">Risk Score:</span>
                          <span className="result-value">{modelResults.risk_score.toFixed(2)}</span>
                        </div>
                      )}
                      {modelResults.prediction && (
                        <div className="result-item">
                          <span className="result-label">Prediction:</span>
                          <span className="result-value">{modelResults.prediction}</span>
                        </div>
                      )}
                      {modelResults.confidence !== undefined && (
                        <div className="result-item">
                          <span className="result-label">Confidence:</span>
                          <span className="result-value">{(modelResults.confidence * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      {modelResults.category && (
                        <div className="result-item">
                          <span className="result-label">Category:</span>
                          <span className="result-value">{modelResults.category}</span>
                        </div>
                      )}
                      {modelResults.recommendation && (
                        <div className="result-item full-width">
                          <span className="result-label">Recommendation:</span>
                          <span className="result-value">{modelResults.recommendation}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="form-actions">
                    <button type="button" className="cancel-btn" onClick={handleCloseResults}>
                      Cancel
                    </button>
                    <button type="button" className="submit-btn" onClick={handleSubmit} disabled={isSaving}>
                      {isSaving ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div >
  );
}

export default Dashboard;
