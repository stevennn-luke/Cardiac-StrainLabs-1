import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import './Dashboard.css';
import logoCSL from '../assets/logo-CSL.png';
import homeScreenBg from '../assets/Home-Screen.jpg';

function Dashboard() {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const [showContent, setShowContent] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };

      // If user enters BMI directly, clear height and weight
      if (name === 'bmi') {
        if (value) {
          newData.height = '';
          newData.weight = '';
        }
      }

      // If user enters height or weight, calculate BMI and clear manual BMI
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
    // Validate required fields
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

    // Validate that either (height AND weight) OR bmi is provided
    const hasHeightWeight = formData.height && formData.weight && formData.height > 0 && formData.weight > 0;
    const hasBMI = formData.bmi && parseFloat(formData.bmi) > 0;

    if (!hasHeightWeight && !hasBMI) {
      alert('Please enter either Height & Weight OR BMI');
      return;
    }

    setIsAnalyzing(true);
    setModelResults(null);

    try {
      // Prepare data to send to the model
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

      const response = await fetch('http://127.0.0.1:8000/analyze', {
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
        setShowPopup(false); // Close the input form
        console.log('Model results:', data);
      }
    } catch (error) {
      console.error('Error during analysis:', error);
      alert('Failed to analyze data. Make sure the API server is running on http://127.0.0.1:8000');
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

    // Validate that either (height AND weight) OR bmi is provided
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
        updatedAt: new Date().toISOString()
      };

      console.log('Attempting to save to Firestore...');
      console.log('User UID:', currentUser.uid);
      console.log('Data to save:', userProfileData);


      const userRef = doc(db, 'userProfiles', currentUser.uid);
      console.log('Document reference created:', userRef.path);

      await setDoc(userRef, userProfileData, { merge: true });

      console.log('✅ Profile saved successfully to Firestore!');
      console.log('Document path:', userRef.path);
      console.log('Saved data:', userProfileData);

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


      await verifyDataStored(userRef);

      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Error saving profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const verifyDataStored = async (userRef) => {
    try {
      console.log('🔍 Verifying data was stored in Firestore...');
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        console.log('✅ Data found in Firestore!');
        console.log('Document ID:', docSnap.id);
        console.log('Document data:', docSnap.data());
        console.log('Document path:', docSnap.ref.path);
      } else {
        console.log('❌ No document found in Firestore!');
      }
    } catch (error) {
      console.error('Error verifying data:', error);
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
    setModelResults(null);
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

  return (
    <div className="dashboard-container" style={{ backgroundImage: `url(${homeScreenBg})` }}>
      <div className="dashboard-overlay">
        <nav className="navbar">
          <div className="nav-logo">
            <img src={logoCSL} alt="Cardiac Strain Labs" className="logo-img" />
          </div>
          <div className="nav-links">
            <a href="#home" className="nav-link">Home</a>
            <a href="#add-user" className="nav-link">Add User</a>
            <a href="#track-user" className="nav-link">Track User</a>
            <a href="#profile" className="nav-link">Profile</a>
            <a href="#vision" className="nav-link">Our Vision</a>
            <button onClick={handleLogout} className="nav-link logout-btn">Logout</button>
          </div>
        </nav>

        <div className="main-content">
          <div className={`content-text ${showContent ? 'animate-in' : ''}`}>
            <h1 className="main-heading">AI-Powered Cardiac Care</h1>
            <h2 className="sub-heading">from innovation to impact</h2>
            <p className="description">
              we propose a Large Language Model (LLM)–informed, AI-driven heart health system that integrates clinical precision with public accessibility.
            </p>
            <button className="try-it-btn" onClick={() => setShowPopup(true)}>
              Try it Out
            </button>
          </div>
        </div>
      </div>

      {showPopup && (
        <div className="popup-overlay" onClick={handleClosePopup}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h2 className="popup-title">Add User Profile</h2>
              <button className="close-btn" onClick={handleClosePopup}>×</button>
            </div>

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
                    disabled={!!formData.bmi}
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
                    disabled={!!formData.bmi}
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
  );
}

export default Dashboard;
