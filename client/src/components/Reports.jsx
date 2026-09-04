import React, { useState } from 'react';
import {
  Camera,
  Navigation
} from 'lucide-react';

import PageTitle from './PageTitle';
import { API } from '../App';

export default function Reports({
  reports,
  reload
}) {
  const [form, setForm] = useState({
    type: 'Ground crack',
    description: '',
    lat: '',
    lng: ''
  });

  const [photo, setPhoto] =
    useState(null);

  const [status, setStatus] =
    useState('');

  const [submitting, setSubmitting] =
    useState(false);

  const geo = () => {
    if (!navigator.geolocation) {
      setStatus(
        'Geolocation is not supported by this browser.'
      );
      return;
    }

    setStatus(
      'Getting current location...'
    );

    navigator.geolocation.getCurrentPosition(
      position => {
        setForm(old => ({
          ...old,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6)
        }));

        setStatus(
          'GPS location captured.'
        );
      },
      () => {
        setStatus(
          'Location permission unavailable.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const submit = async event => {
    event.preventDefault();

    if (submitting) return;

    try {
      setSubmitting(true);
      setStatus('Submitting report...');

      const formData = new FormData();

      Object.entries(form).forEach(
        ([key, value]) =>
          formData.append(key, value)
      );

      if (photo) {
        formData.append('photo', photo);
      }

      const response = await fetch(
        `${API}/reports`,
        {
          method: 'POST',
          body: formData
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Report submission failed'
        );
      }

      setForm({
        type: 'Ground crack',
        description: '',
        lat: '',
        lng: ''
      });

      setPhoto(null);

      setStatus(
        'Report received successfully.'
      );

      await reload();
    } catch (error) {
      setStatus(
        error.message ||
        'Could not submit report.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageTitle
        title="Citizen & Field Reporting"
        sub="Geo-tagged observations help strengthen situational awareness."
        icon={<Camera />}
      />

      <div className="grid2 reportsGrid">
        <section className="card">
          <h2>
            Submit an observation
          </h2>

          <p className="muted">
            For prototype use. Do not upload sensitive personal information.
          </p>

          <form onSubmit={submit}>
            <label>
              Observation type

              <select
                value={form.type}
                onChange={e =>
                  setForm({
                    ...form,
                    type: e.target.value
                  })
                }
              >
                <option>Ground crack</option>
                <option>Slope movement</option>
                <option>Rockfall</option>
                <option>Blocked road</option>
                <option>Other</option>
              </select>
            </label>

            <label>
              Description

              <textarea
                value={form.description}
                onChange={e =>
                  setForm({
                    ...form,
                    description:
                      e.target.value
                  })
                }
                placeholder="Describe what you observed..."
              />
            </label>

            <div className="two">
              <label>
                Latitude

                <input
                  value={form.lat}
                  onChange={e =>
                    setForm({
                      ...form,
                      lat: e.target.value
                    })
                  }
                />
              </label>

              <label>
                Longitude

                <input
                  value={form.lng}
                  onChange={e =>
                    setForm({
                      ...form,
                      lng: e.target.value
                    })
                  }
                />
              </label>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={geo}
            >
              <Navigation size={16} />
              Use current GPS
            </button>

            <label className="upload">
              <Camera />

              <span>
                {photo
                  ? photo.name
                  : 'Attach photo / evidence'}
              </span>

              <input
                type="file"
                accept="image/*,video/*"
                onChange={e =>
                  setPhoto(
                    e.target.files?.[0] ||
                    null
                  )
                }
              />
            </label>

            <button
              className="primary"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? 'Submitting...'
                : 'Submit field report'}
            </button>

            {status && (
              <div className="formStatus">
                {status}
              </div>
            )}
          </form>
        </section>

        <section className="card">
          <div className="cardHead">
            <div>
              <h2>Recent reports</h2>
              <p>
                Incoming observations from field users.
              </p>
            </div>
          </div>

          <div className="reportList">
            {reports.length === 0 ? (
              <p className="muted">
                No reports yet.
              </p>
            ) : (
              reports.slice(0, 8).map(
                (report, index) => (
                  <div
                    className="reportRow"
                    key={
                      report.id ??
                      `${report.lat}-${report.lng}-${index}`
                    }
                  >
                    <span className="reportIcon">
                      <Camera size={17} />
                    </span>

                    <div>
                      <b>{report.type}</b>

                      <small>
                        {report.lat &&
                        report.lng
                          ? `${report.lat}, ${report.lng}`
                          : 'Location not provided'}
                      </small>

                      <small>
                        {report.createdAt
                          ? new Date(
                              report.createdAt
                            ).toLocaleString()
                          : ''}
                      </small>

                      {report.description && (
                        <small>
                          {report.description}
                        </small>
                      )}
                    </div>

                    <span className="status">
                      {report.status}
                    </span>
                  </div>
                )
              )
            )}
          </div>
        </section>
      </div>
    </>
  );
}