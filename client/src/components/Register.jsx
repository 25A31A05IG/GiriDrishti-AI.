import React, { useState } from 'react';
import {
  Mountain,
  User,
  Mail,
  Lock,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';

import { API } from '../App';

export default function Register({
  onOTP,
  onLogin
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const [password, setPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();

    setError('');

    if (password !== confirmPassword) {
      setError(
        'Passwords do not match'
      );

      return;
    }

    if (password.length < 6) {
      setError(
        'Password must be at least 6 characters'
      );

      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API}/auth/register`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({
            name,
            email,
            password
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          'Registration failed'
        );
      }

      onOTP(data.email);

    } catch (err) {
      setError(
        err.message ||
        'Unable to create account'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authPage">

      <div className="authBackground">

        <div className="authBrand">

          <div className="authBrandLogo">
            <Mountain size={30} />
          </div>

          <div>
            <b>GiriDrishti AI</b>

            <span>
              Predict. Warn. Protect.
            </span>
          </div>

        </div>

        <div className="authHero">

          <div className="authLiveBadge">
            <span className="liveDot" />
            Northeast India Risk Intelligence
          </div>

          <h1>
            Join the
            <br />
            <span>Safety Network</span>
          </h1>

          <p>
            Create your GiriDrishti account
            to access AI-powered landslide
            monitoring, alerts and citizen
            reporting.
          </p>

          <div className="authFeatures">

            <div className="authFeature">

              <div className="authFeatureIcon">
                <ShieldCheck size={18} />
              </div>

              <div>
                <b>Verified Access</b>

                <span>
                  Email OTP protects your account
                </span>
              </div>

            </div>

            <div className="authFeature">

              <div className="authFeatureIcon">
                <ArrowRight size={18} />
              </div>

              <div>
                <b>Real-Time Awareness</b>

                <span>
                  Receive important landslide alerts
                </span>
              </div>

            </div>

          </div>

        </div>

        <div className="authFooter">

          <span>
            GiriDrishti AI
          </span>

          <span>
            Intelligent Landslide Risk Monitoring
          </span>

        </div>

      </div>

      <div className="authFormSide">

        <div className="authCard authRegisterCard">

          <div className="authMobileBrand">

            <div className="authLogo">
              <Mountain size={27} />
            </div>

            <div>
              <b>GiriDrishti AI</b>

              <span>
                Predict. Warn. Protect.
              </span>
            </div>

          </div>

          <div className="authHeading">

            <div className="authIconCircle">
              <User size={22} />
            </div>

            <div>

              <h2>Create Account</h2>

              <p>
                Register for GiriDrishti monitoring
              </p>

            </div>

          </div>

          {error && (
            <div className="authError">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>

            <div className="authField">

              <label>Full Name</label>

              <div className="authInputWrap">

                <User size={18} />

                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={e =>
                    setName(e.target.value)
                  }
                  required
                />

              </div>

            </div>

            <div className="authField">

              <label>Email Address</label>

              <div className="authInputWrap">

                <Mail size={18} />

                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={e =>
                    setEmail(e.target.value)
                  }
                  required
                />

              </div>

            </div>

            <div className="authField">

              <label>Password</label>

              <div className="authInputWrap">

                <Lock size={18} />

                <input
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={e =>
                    setPassword(e.target.value)
                  }
                  required
                />

              </div>

            </div>

            <div className="authField">

              <label>Confirm Password</label>

              <div className="authInputWrap">

                <Lock size={18} />

                <input
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={e =>
                    setConfirmPassword(
                      e.target.value
                    )
                  }
                  required
                />

              </div>

            </div>

            <button
              type="submit"
              className="primary authButton"
              disabled={loading}
            >
              {loading
                ? 'Creating Account...'
                : 'Create Account'}
            </button>

          </form>

          <div className="authDivider">
            <span />
            <small>EMAIL VERIFICATION</small>
            <span />
          </div>

          <p className="authSwitch">

            Already have an account?

            <button
              type="button"
              onClick={onLogin}
            >
              Login
            </button>

          </p>

          <div className="authSecurity">

            <ShieldCheck size={16} />

            <span>
              Your account will be verified
              using a one-time email OTP
            </span>

          </div>

        </div>

      </div>

    </div>
  );
}
