import React, {
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  Menu,
  Mountain,
  Gauge,
  Map as MapIcon,
  Bell,
  Camera,
  AlertTriangle,
  ShieldCheck
} from 'lucide-react';

import Dashboard from './components/Dashboard';
import RiskMapPage from './components/RiskMapPage';
import Alerts from './components/Alerts';
import Reports from './components/Reports';
import Detail from './components/Detail';

import Login from './components/Login';
import Register from './components/Register';
import OTPVerification from './components/OTPVerification';

import './styles.css';


export const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:5000/api';


export const riskClass = risk => {
  switch (
    String(risk || '').toUpperCase()
  ) {
    case 'CRITICAL':
      return 'critical';

    case 'HIGH':
      return 'high';

    case 'MODERATE':
      return 'moderate';

    default:
      return 'low';
  }
};


export const riskColor = risk => {
  switch (
    String(risk || '').toUpperCase()
  ) {
    case 'CRITICAL':
      return '#ef4444';

    case 'HIGH':
      return '#f97316';

    case 'MODERATE':
      return '#eab308';

    default:
      return '#22c55e';
  }
};


export const sameId = (a, b) => {
  if (a == null || b == null)
    return false;

  return String(a) === String(b);
};


export const getAreaName = location => {
  if (!location)
    return 'Unknown Area';

  const names = [
    location.areaName,
    location.area,
    location.locationName,
    location.placeName,
    location.city,
    location.town,
    location.village,
    location.suburb,
    location.municipality,
    location.district
  ];

  for (const value of names) {
    if (
      typeof value === 'string' &&
      value.trim() &&
      ![
        'unknown',
        'unknown area'
      ].includes(
        value.trim().toLowerCase()
      )
    ) {
      return value.trim();
    }
  }

  if (
    typeof location.name === 'string' &&
    location.name.trim()
  ) {
    const name =
      location.name.trim();

    const lower =
      name.toLowerCase();

    if (
      !lower.includes('risk point') &&
      !lower.includes('riskpoint') &&
      !lower.includes('point-') &&
      !lower.includes('point ')
    ) {
      return name;
    }
  }

  return 'Unknown Area';
};


export const getRiskPointName =
  location => {
    if (!location)
      return 'Risk Point';

    return (
      location.riskPointName ||
      location.pointName ||
      location.riskPoint ||
      location.point_id ||
      location.slide_id ||
      location.slideId ||
      (
        location.id
          ? `Risk Point ${location.id}`
          : 'Risk Point'
      )
    );
  };


export const reverseGeocode =
  async (lat, lng) => {
    try {
      const response =
        await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
            lat
          )}&lon=${encodeURIComponent(
            lng
          )}&zoom=14&addressdetails=1&accept-language=en`,
          {
            headers: {
              Accept:
                'application/json'
            }
          }
        );

      if (!response.ok)
        throw new Error(
          'Unable to find area name'
        );

      const data =
        await response.json();

      const address =
        data.address || {};

      const areaName =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.suburb ||
        address.county ||
        address.state_district ||
        address.state ||
        'Area unavailable';

      return {
        areaName,
        district:
          address.county ||
          address.state_district ||
          '',
        state:
          address.state || '',
        displayName:
          data.display_name ||
          areaName
      };

    } catch (error) {
      console.error(
        'Reverse geocoding error:',
        error
      );

      return {
        areaName:
          'Area unavailable',
        district: '',
        state: '',
        displayName: ''
      };
    }
  };


export const enrichLocation =
  async location => {
    if (!location)
      return location;

    const existingArea =
      getAreaName(location);

    if (
      existingArea !==
      'Unknown Area'
    ) {
      return {
        ...location,
        areaName:
          existingArea
      };
    }

    const lat =
      Number(location.lat);

    const lng =
      Number(location.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return location;
    }

    const geo =
      await reverseGeocode(
        lat,
        lng
      );

    return {
      ...location,
      areaName:
        geo.areaName,
      district:
        location.district ||
        geo.district,
      state:
        location.state ||
        geo.state,
      displayName:
        geo.displayName
    };
  };


export const fetchLocationReport = async (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error("Valid latitude and longitude are required");
  }

  const response = await fetch(
    `${API}/location-report?lat=${encodeURIComponent(
      latitude
    )}&lng=${encodeURIComponent(longitude)}`
  );

  if (!response.ok) {
    let message =
      "Unable to get live conditions for this location";

    try {
      const data = await response.json();
      if (data?.error) {
        message = data.error;
      }
    } catch {
      // Keep the default message when the response is not JSON.
    }

    throw new Error(message);
  }

  const data = await response.json();

  return {
    ...data,
    lat:
      data.lat ??
      data.latitude ??
      latitude,
    lng:
      data.lng ??
      data.longitude ??
      longitude
  };
};


function App() {

  const [user, setUser] =
    useState(() => {
      try {
        return JSON.parse(
          localStorage.getItem(
            'giridrishti_user'
          )
        );
      } catch {
        return null;
      }
    });


  const [authPage, setAuthPage] =
    useState('login');

  const [otpEmail, setOtpEmail] =
    useState('');


  const [locations, setLocations] =
    useState([]);

  const [page, setPage] =
    useState('dashboard');

  const [selected, setSelected] =
    useState(null);

  const [alerts, setAlerts] =
    useState([]);

  const [reports, setReports] =
    useState([]);

  const [menu, setMenu] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');


  const logout = () => {
    localStorage.removeItem(
      'giridrishti_token'
    );

    localStorage.removeItem(
      'giridrishti_user'
    );

    setUser(null);
    setAuthPage('login');
  };


  const load = async () => {
    if (!user)
      return;

    try {
      setLoading(true);
      setError('');

      const token =
        localStorage.getItem(
          'giridrishti_token'
        );

      const headers = token
        ? {
            Authorization:
              `Bearer ${token}`
          }
        : {};

      const [
        locationsRes,
        alertsRes,
        reportsRes
      ] =
        await Promise.all([
          fetch(
            `${API}/locations`,
            { headers }
          ),

          fetch(
            `${API}/alerts`,
            { headers }
          ),

          fetch(
            `${API}/reports`,
            { headers }
          )
        ]);


      if (!locationsRes.ok)
        throw new Error(
          'Unable to load live locations'
        );

      if (!alertsRes.ok)
        throw new Error(
          'Unable to load live alerts'
        );

      if (!reportsRes.ok)
        throw new Error(
          'Unable to load reports'
        );


      const locationsData =
        await locationsRes.json();

      const alertsData =
        await alertsRes.json();

      const reportsData =
        await reportsRes.json();


      setLocations(
        Array.isArray(
          locationsData
        )
          ? locationsData
          : locationsData?.value ||
              []
      );

      setAlerts(
        Array.isArray(
          alertsData
        )
          ? alertsData
          : alertsData?.value ||
              []
      );

      setReports(
        Array.isArray(
          reportsData
        )
          ? reportsData
          : reportsData?.value ||
              []
      );

    } catch (err) {
      console.error(err);

      setError(
        'Unable to connect to GiriDrishti backend. Make sure the API server is running.'
      );

    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (!user)
      return;

    load();

    const interval =
      setInterval(
        load,
        5 * 60 * 1000
      );

    return () =>
      clearInterval(interval);

  }, [user]);


  const counts =
    useMemo(
      () => ({
        critical:
          locations.filter(
            x =>
              String(
                x.riskLevel
              ).toUpperCase() ===
              'CRITICAL'
          ).length,

        high:
          locations.filter(
            x =>
              String(
                x.riskLevel
              ).toUpperCase() ===
              'HIGH'
          ).length,

        moderate:
          locations.filter(
            x =>
              String(
                x.riskLevel
              ).toUpperCase() ===
              'MODERATE'
          ).length,

        low:
          locations.filter(
            x =>
              String(
                x.riskLevel
              ).toUpperCase() ===
              'LOW'
          ).length
      }),
      [locations]
    );


  const avg =
    locations.length
      ? Math.round(
          locations.reduce(
            (
              sum,
              location
            ) =>
              sum +
              Number(
                location.riskScore ||
                  0
              ),
            0
          ) /
            locations.length
        )
      : 0;


  const navigate =
    nextPage => {
      setPage(nextPage);
      setMenu(false);
      setSelected(null);
    };


  const handleSelectLocation =
    async location => {
      if (!location)
        return;

      setSelected(location);

      if (
        getAreaName(
          location
        ) ===
        'Unknown Area'
      ) {
        setSelected(
          await enrichLocation(
            location
          )
        );
      }
    };


  // LOGIN / REGISTER SCREEN
  if (!user) {

    if (
      authPage ===
      'register'
    ) {
      return (
        <Register
          onOTP={email => {
            setOtpEmail(email);
            setAuthPage(
              'otp'
            );
          }}
          onLogin={() =>
            setAuthPage(
              'login'
            )
          }
        />
      );
    }


    if (
      authPage ===
      'otp'
    ) {
      return (
        <OTPVerification
          email={otpEmail}
          onVerified={() =>
            setAuthPage(
              'login'
            )
          }
          onBack={() =>
            setAuthPage(
              'register'
            )
          }
        />
      );
    }


    return (
      <Login
        onLogin={loggedInUser =>
          setUser(
            loggedInUser
          )
        }
        onRegister={() =>
          setAuthPage(
            'register'
          )
        }
      />
    );
  }


  // MAIN APPLICATION
  return (
    <div className="app">

      <header>

        <div className="brand">

          <div className="logo">
            <Mountain size={22} />
          </div>

          <div>
            <b>
              GiriDrishti AI
            </b>

            <span>
              Predict. Warn. Protect.
            </span>
          </div>

        </div>


        <div className="topStatus">

          <span className="liveDot" />

          Monitoring NER

          <span
            style={{
              marginLeft: 15
            }}
          >
            {user.name}
          </span>

          <button
            className="logoutButton"
            onClick={logout}
          >
            Logout
          </button>

          <button
            onClick={() =>
              setMenu(!menu)
            }
            className="mobileMenu"
          >
            <Menu />
          </button>

        </div>

      </header>


      <div className="layout">

        <aside
          className={
            menu
              ? 'open'
              : ''
          }
        >

          <button
            className={
              page ===
              'dashboard'
                ? 'active'
                : ''
            }
            onClick={() =>
              navigate(
                'dashboard'
              )
            }
          >
            <Gauge />
            Dashboard
          </button>


          <button
            className={
              page === 'map'
                ? 'active'
                : ''
            }
            onClick={() =>
              navigate('map')
            }
          >
            <MapIcon />
            Risk Map
          </button>


          <button
            className={
              page ===
              'alerts'
                ? 'active'
                : ''
            }
            onClick={() =>
              navigate(
                'alerts'
              )
            }
          >
            <Bell />

            Alerts

            <em>
              {alerts.length}
            </em>

          </button>


          <button
            className={
              page ===
              'reports'
                ? 'active'
                : ''
            }
            onClick={() =>
              navigate(
                'reports'
              )
            }
          >
            <Camera />

            Citizen Reports

            <em>
              {reports.length}
            </em>

          </button>


          <div className="sideInfo">

            <ShieldCheck size={18} />

            <span>
              Decision support prototype

              <br />

              <small>
                Demo model • verify before field action
              </small>
            </span>

          </div>

        </aside>


        <main>

          {loading && (
            <div
              className="card"
              style={{
                marginBottom: 20
              }}
            >
              <p>
                Scanning live Northeast India risk data...
              </p>
            </div>
          )}


          {error && (
            <div className="notice">

              <AlertTriangle />

              <div>

                <b>
                  Backend connection problem
                </b>

                <span>
                  {error}
                </span>

                <button
                  className="primary"
                  style={{
                    marginTop: 10
                  }}
                  onClick={load}
                >
                  Retry
                </button>

              </div>

            </div>
          )}


          {page ===
            'dashboard' && (
            <Dashboard
              locations={
                locations
              }
              counts={counts}
              avg={avg}
              alerts={
                alerts
              }
              onSelect={
                handleSelectLocation
              }
              setPage={
                setPage
              }
            />
          )}


          {page === 'map' && (
            <RiskMapPage
              locations={
                locations
              }
              onSelect={
                handleSelectLocation
              }
            />
          )}


          {page ===
            'alerts' && (
            <Alerts
              alerts={alerts}
              locations={
                locations
              }
              onSelect={
                handleSelectLocation
              }
            />
          )}


          {page ===
            'reports' && (
            <Reports
              reports={
                reports
              }
              reload={
                load
              }
            />
          )}

        </main>

      </div>


      {selected && (
        <Detail
          location={
            selected
          }
          onClose={() =>
            setSelected(
              null
            )
          }
        />
      )}

    </div>
  );
}


export default App;