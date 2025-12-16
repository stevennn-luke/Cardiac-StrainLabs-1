import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './SignIn.css';
import logoCSL from '../assets/logo-CSL.png';
import signinBg from '../assets/signin-image.jpg';
import googleLogo from '../assets/credentials-logo/google.png';
import appleLogo from '../assets/credentials-logo/apple.png';

function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const skipAnimation = location.state?.skipAnimation === true;
  const { login, signInWithGoogle, signInWithApple } = useAuth();
  
  const [showLogo, setShowLogo] = useState(false);
  const [showText, setShowText] = useState(false);
  const [moveToPosition, setMoveToPosition] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (skipAnimation) {
      setMoveToPosition(true);
      setShowLogo(true);
      setShowText(true);
      
      const cardTimer = setTimeout(() => {
        setShowCard(true);
      }, 600);

      return () => {
        clearTimeout(cardTimer);
      };
    } else {
      setShowLogo(false);
      setShowText(false);
      setMoveToPosition(false);
      setShowCard(false);
      

      const logoTimer = setTimeout(() => {
        setShowLogo(true);
      }, 300);


      const textTimer = setTimeout(() => {
        setShowText(true);
      }, 1000);


      const fadeOutTimer = setTimeout(() => {
        setShowLogo(false);
        setShowText(false);
      }, 3500);

 
      const moveTimer = setTimeout(() => {
        setMoveToPosition(true);
      }, 4000);
      
      const fadeInTimer = setTimeout(() => {
        setShowLogo(true);
        setShowText(true);
      }, 4100);


      const cardTimer = setTimeout(() => {
        setShowCard(true);
      }, 4300);

      return () => {
        clearTimeout(logoTimer);
        clearTimeout(textTimer);
        clearTimeout(fadeOutTimer);
        clearTimeout(moveTimer);
        clearTimeout(fadeInTimer);
        clearTimeout(cardTimer);
      };
    }
  }, [skipAnimation]);

  const handleSignUp = () => {
    navigate('/', { state: { skipAnimation: true } });
  };

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      setError('');
      setLoading(true);
      await login(email, password);
      navigate('/dashboard');
    } catch (error) {
      setError('Failed to sign in: ' + error.message);
    }
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    try {
      setError('');
      setLoading(true);
      await signInWithGoogle();
      navigate('/dashboard');
    } catch (error) {
      setError('Failed to sign in with Google: ' + error.message);
    }
    setLoading(false);
  }

  async function handleAppleSignIn() {
    try {
      setError('');
      setLoading(true);
      await signInWithApple();
      navigate('/dashboard');
    } catch (error) {
      setError('Failed to sign in with Apple: ' + error.message);
    }
    setLoading(false);
  }

  return (
    <div className="signin-container" style={{ backgroundImage: `url(${signinBg})` }}>
      <div className="signin-overlay">
        <div className={`content-wrapper ${moveToPosition ? 'positioned' : 'centered'}`}>
          <div className="left-section">
            <div>
              <div className={`logo-container ${showLogo ? 'fade-in' : ''}`}>
                <img src={logoCSL} alt="Cardiac Strain Labs Logo" className="logo-csl" />
              </div>
              
              <div className={`tagline-container ${showText ? 'fade-in' : ''}`}>
                <h1 className="main-heading">Protect your heart...</h1>
                <p className="tagline-text">
                  To investigate the correlation between Global Longitudinal Strain (GLS) and NFATC3 gene expression in HFpEF patients.
                </p>
                
                <div className="pagination-dots">
                  <span className="dot active"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </div>
              </div>
            </div>
          </div>

          <div className={`right-section ${showCard ? 'show-card' : ''}`}>
            <div className="signin-card">
              <h2 className="card-title">Log In to your Account</h2>
              
              {error && <div className="error-message">{error}</div>}
              
              <form className="signin-form" onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input 
                    type="email" 
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="password-wrapper">
                    <input 
                      type={showPassword ? "text" : "password"}
                      className="form-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button 
                      type="button" 
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M10 4C4.5 4 2 10 2 10s2.5 6 8 6 8-6 8-6-2.5-6-8-6z" stroke="currentColor" strokeWidth="2"/>
                        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="remember-forgot">
                  <label className="remember-me">
                    <input 
                      type="checkbox" 
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Remember me</span>
                  </label>
                  <a href="/forgot-password" className="forgot-link">Forgot Password?</a>
                </div>
                
                <button type="submit" className="continue-btn" disabled={loading}>
                  {loading ? 'SIGNING IN...' : 'CONTINUE'}
                </button>
              </form>

              <div className="divider">
                <span>Or</span>
              </div>

              <div className="social-buttons">
                <button onClick={handleGoogleSignIn} type="button" className="social-btn google-btn" disabled={loading}>
                  <img src={googleLogo} alt="Google" className="social-icon" />
                  Sign in with Google
                </button>
                
                <button onClick={handleAppleSignIn} type="button" className="social-btn apple-btn" disabled={loading}>
                  <img src={appleLogo} alt="Apple" className="social-icon" />
                  Sign in with Apple
                </button>
              </div>

              <div className="signup-link">
                New User? <button onClick={handleSignUp} className="signup-btn">SIGN UP HERE</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignIn;

