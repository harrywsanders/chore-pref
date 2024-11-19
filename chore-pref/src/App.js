import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

// Initialize Supabase client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function App() {
  const [roommateName, setRoommateName] = useState('');
  const [roommateId, setRoommateId] = useState(null);
  const [chores, setChores] = useState([]);
  const [preferences, setPreferences] = useState({});
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef(null);

  // Fetch the list of chores from Supabase
  useEffect(() => {
    const fetchChores = async () => {
      let { data: choresData, error } = await supabase.from('chores').select('*');
      if (error) {
        console.error('Error fetching chores:', error);
      } else {
        setChores(choresData);
      }
    };
    fetchChores();
  }, []);

  // Fetch roommate and preferences when roommateName changes, with debounce
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (roommateName.trim() !== '') {
        fetchRoommateData(roommateName.trim());
      } else {
        setRoommateId(null);
        setPreferences({});
      }
    }, 500); // Adjust debounce time as needed
  }, [roommateName]);

  // Fetch roommate and preferences by name
  const fetchRoommateData = async (name) => {
    const trimmedName = name.trim();

    // Fetch roommate by name
    let { data: roommateData, error: roommateError } = await supabase
      .from('roommates')
      .select('*')
      .eq('name', trimmedName)
      .single(); // Use .single() since names are unique

    if (roommateError) {
      if (roommateError.code === 'PGRST116') {
        // No roommate found
        setRoommateId(null);
        setPreferences({});
      } else {
        console.error('Error fetching roommate:', roommateError);
      }
      return;
    }

    if (roommateData) {
      setRoommateId(roommateData.id);

      // Fetch preferences for the roommate
      let { data: preferencesData, error: preferencesError } = await supabase
        .from('preferences')
        .select('chore_id, preference_score')
        .eq('roommate_id', roommateData.id);

      if (preferencesError) {
        console.error('Error fetching preferences:', preferencesError);
      } else {
        const preferencesMap = {};
        preferencesData.forEach((pref) => {
          preferencesMap[pref.chore_id] = pref.preference_score;
        });
        setPreferences(preferencesMap);
      }
    }
  };

  // Handle preference change for each chore
  const handlePreferenceChange = (choreId, score) => {
    setPreferences((prev) => ({ ...prev, [choreId]: score }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let currentRoommateId = roommateId;

      // Trim the roommate name
      const trimmedName = roommateName.trim();

      // Fetch roommate by name to check if it exists
      if (!currentRoommateId) {
        let { data: existingRoommate, error: fetchError } = await supabase
          .from('roommates')
          .select('id')
          .eq('name', trimmedName)
          .maybeSingle();

        if (fetchError) {
          throw fetchError;
        }

        if (existingRoommate) {
          // Roommate exists, use existing ID
          currentRoommateId = existingRoommate.id;
          setRoommateId(currentRoommateId);
        } else {
          // Insert new roommate
          let { data: roommateData, error: roommateError } = await supabase
            .from('roommates')
            .insert([{ name: trimmedName }])
            .select()
            .single();

          if (roommateError) {
            throw roommateError;
          }
          currentRoommateId = roommateData.id;
          setRoommateId(currentRoommateId);
        }
      }

      // Prepare preferences data
      const preferencesData = chores.map((chore) => ({
        roommate_id: currentRoommateId,
        chore_id: chore.id,
        preference_score: preferences[chore.id] || 1,
      }));

      // Upsert preferences
      let { error: preferencesError } = await supabase
        .from('preferences')
        .upsert(preferencesData, { onConflict: 'roommate_id,chore_id' });

      if (preferencesError) {
        throw preferencesError;
      }

      alert('Preferences saved successfully!');
    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred while saving preferences.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <h1>Roommate Chore Preferences</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Roommate Name:
            <input
              type="text"
              value={roommateName}
              onChange={(e) => setRoommateName(e.target.value)}
              required
            />
          </label>
        </div>
        <div>
          <h2>Rate the Chores (1-5)</h2>
          {chores.map((chore) => (
            <div key={chore.id}>
              <label>
                {chore.name}:
                <select
                  value={preferences[chore.id] || 1}
                  onChange={(e) => handlePreferenceChange(chore.id, parseInt(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((score) => (
                    <option key={score} value={score}>
                      {score}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
        <button type="submit" disabled={loading || roommateName.trim() === ''}>
          {loading ? 'Saving...' : 'Submit'}
        </button>
      </form>
    </div>
  );
}

export default App;
