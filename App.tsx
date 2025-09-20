import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, ActivityIndicator, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { formatPlan, loadStaticTracks, predictBestStrategy, TrackDictionary, formatSeconds } from './StrategyEngine';
import { getRaceSessions, getLaps, getDrivers, inferPitLossFromLaps, inferDegradationFromLaps } from './OpenF1';

function StrategyScreen() {
  const [tracks, setTracks] = useState<TrackDictionary | null>(null);
  const [trackName, setTrackName] = useState<string>('Monza');
  const [raceYear, setRaceYear] = useState<string>('2024');
  const [driverName, setDriverName] = useState<string>('');
  const [rainProb, setRainProb] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionTracks, setSessionTracks] = useState<string[]>([]);

  // fetch OpenF1 session track names on year change
  useEffect(() => {
    const y = Number(raceYear || '2024');
    getRaceSessions(y)
      .then((sessions: any[]) => {
        const names = Array.from(new Set((sessions || [])
          .map(s => s?.circuit_short_name)
          .filter((x: any) => typeof x === 'string' && x.trim().length > 0)));
        setSessionTracks(names);
      })
      .catch(() => setSessionTracks([]));
  }, [raceYear]);

  useEffect(() => {
    loadStaticTracks().then(setTracks).catch((e) => setError(String(e)));
  }, []);

  const onPredict = async () => {
    if (!tracks) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      // Attempt mode C: refine pit loss and degradation from OpenF1 if possible
      let tracksForRun: TrackDictionary = tracks;
      try {
        const sessions = await getRaceSessions(Number(raceYear || '2024'));
        const race = sessions?.find((s: any) => typeof s?.circuit_short_name === 'string' && s.circuit_short_name.toLowerCase().includes(trackName.toLowerCase()));
        if (race?.session_key) {
          const laps = await getLaps(race.session_key);
          const pit = await inferPitLossFromLaps(laps);
          const deg = inferDegradationFromLaps(laps);

          // Build dynamic track entry if missing
          if (!tracks[trackName]) {
            const durations = laps.map(l => l.duration).filter((x): x is number => typeof x === 'number' && x > 30 && x < 200);
            const sorted = [...durations].sort((a, b) => a - b);
            const p20 = sorted.length ? sorted[Math.floor(sorted.length * 0.2)] : 90;
            const lapsCount = laps.length ? Math.max(...laps.map(l => l.lap_number || 0)) : 50;

            // derive fallback averages from known tracks
            const values = Object.values(tracks);
            const avgPit = values.reduce((a, t) => a + t.pit_loss_seconds, 0) / values.length;
            const avgBase = values.reduce((a, t) => a + t.base_lap_time_seconds, 0) / values.length;
            const avgDeg = {
              SOFT: values.reduce((a, t) => a + t.degradation_per_lap_seconds.SOFT, 0) / values.length,
              MEDIUM: values.reduce((a, t) => a + t.degradation_per_lap_seconds.MEDIUM, 0) / values.length,
              HARD: values.reduce((a, t) => a + t.degradation_per_lap_seconds.HARD, 0) / values.length,
            };

            tracksForRun = {
              ...tracksForRun,
              [trackName]: {
                laps: lapsCount,
                pit_loss_seconds: pit || avgPit,
                base_lap_time_seconds: p20 || avgBase,
                degradation_per_lap_seconds: {
                  SOFT: (deg?.SOFT as any) ?? avgDeg.SOFT,
                  MEDIUM: (deg?.MEDIUM as any) ?? avgDeg.MEDIUM,
                  HARD: (deg?.HARD as any) ?? avgDeg.HARD,
                },
              },
            };
          } else if (pit || deg) {
            // refine known track
            tracksForRun = {
              ...tracks,
              [trackName]: {
                ...tracks[trackName],
                pit_loss_seconds: pit || tracks[trackName].pit_loss_seconds,
                degradation_per_lap_seconds: {
                  ...tracks[trackName].degradation_per_lap_seconds,
                  ...(deg ? {
                    SOFT: (deg.SOFT as any) ?? tracks[trackName].degradation_per_lap_seconds.SOFT,
                    MEDIUM: (deg.MEDIUM as any) ?? tracks[trackName].degradation_per_lap_seconds.MEDIUM,
                    HARD: (deg.HARD as any) ?? tracks[trackName].degradation_per_lap_seconds.HARD,
                  } : {})
                }
              }
            };
          }
        }
      } catch (e) {
        // Ignore OpenF1 failures silently; we still have static fallback
      }

      const plan = await predictBestStrategy({
        trackName,
        raceYear: Number(raceYear || '2024'),
        driverName: driverName || undefined,
        rainProbabilityPct: Number(rainProb || '0'),
        tracksData: tracksForRun,
        mode: 'C',
      });
      setResult(formatPlan(plan));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const trackChips = useMemo(() => (
    (sessionTracks.length ? sessionTracks : Object.keys(tracks || {}))
      .filter(n => n && typeof n === 'string' && n.toLowerCase() !== 'default')
  ), [sessionTracks, tracks]);

  const filteredSuggestions = useMemo(() => (
    (sessionTracks || [])
      .filter(name => name.toLowerCase().includes((trackName || '').toLowerCase()))
      .slice(0, 6)
  ), [sessionTracks, trackName]);

  return (
    <ScrollView 
      contentContainerStyle={styles.scrollContainer} 
      style={{ backgroundColor: '#0b0f16', flex: 1 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerArea}>
        <Text style={styles.appName}>RaceMind</Text>
        <Text style={styles.subtitle}>F1 race strategy predictor</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Track</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {trackChips.map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, t === trackName && styles.chipActive]} onPress={() => setTrackName(t)}>
              <Text style={[styles.chipText, t === trackName && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput style={styles.input} placeholder="Or type a track" placeholderTextColor="#708090" value={trackName} onChangeText={setTrackName} />
        {filteredSuggestions.length > 0 && (
          <View style={styles.suggestBox}>
            {filteredSuggestions.map(s => (
              <TouchableOpacity key={s} style={styles.suggestItem} onPress={() => setTrackName(s)}>
                <Text style={styles.suggestText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Race parameters</Text>
        <Text style={styles.label}>Year</Text>
        <TextInput style={styles.input} placeholder="2024" placeholderTextColor="#708090" value={raceYear} onChangeText={setRaceYear} keyboardType="numeric" />
        <Text style={styles.label}>Driver (optional)</Text>
        <TextInput style={styles.input} placeholder="e.g., Lando Norris" placeholderTextColor="#708090" value={driverName} onChangeText={setDriverName} />
        <Text style={styles.label}>Rain probability %</Text>
        <TextInput style={styles.input} placeholder="0" placeholderTextColor="#708090" value={rainProb} onChangeText={setRainProb} keyboardType="numeric" />
      </View>

      <TouchableOpacity style={[styles.ctaButton, (!tracks || loading) && styles.ctaDisabled]} disabled={!tracks || loading} onPress={onPredict}>
        <Text style={styles.ctaText}>{loading ? 'Calculating…' : 'Predict strategy'}</Text>
      </TouchableOpacity>
      <Text style={styles.modeHint}>Mode: auto (C with fallback to B/A)</Text>

      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}
      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Predicted plan</Text>
          {/* Convert "Stint i: COMPOUND x L laps | ... • Stops: N • Total: mm:ss.mmm" into bullets */}
          {(() => {
            const bullets: string[] = [];
            const parts = result.split('•');
            const stintsPart = parts[0];
            const other = parts.slice(1).join('•');
            const stintItems = stintsPart.split('|').map(s => s.trim());
            stintItems.forEach((s, i) => bullets.push(`• ${s}`));
            bullets.push(`• ${other.trim()}`);
            return bullets;
          })().map((line, idx) => (
            <Text key={idx} style={styles.result}>{line}</Text>
          ))}
        </View>
      )}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
      <StatusBar style="dark" />
    </ScrollView>
  );
}

function TelemetryScreen() {
  const [selectedYear, setSelectedYear] = useState<string>('2024');
  const [selectedTrack, setSelectedTrack] = useState<string>('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [availableTracks, setAvailableTracks] = useState<string[]>([]);
  const [sessionKey, setSessionKey] = useState<number | null>(null);
  const [laps, setLaps] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const years = ['2020', '2021', '2022', '2023', '2024'];

  useEffect(() => {
    if (selectedYear) {
      getRaceSessions(Number(selectedYear)).then(sessions => {
        setSessions(sessions);
        const tracks = Array.from(new Set(sessions
          .filter(s => s?.session_name === 'RACE' && s.circuit_short_name)
          .map(s => s.circuit_short_name)
          .filter(Boolean)
        ));
        setAvailableTracks(tracks);
      }).catch(() => {
        setSessions([]);
        setAvailableTracks([]);
      });
    }
  }, [selectedYear]);

  const handleSearch = async () => {
    if (!selectedYear) return;
    
    setLoading(true);
    setError(null);
    setHasSearched(true);
    
    try {
      // Try OpenF1 first
      const sessions = await getRaceSessions(Number(selectedYear));
      const filteredSessions = sessions.filter(s => 
        s?.session_name === 'RACE' && 
        (!selectedTrack || s.circuit_short_name?.toLowerCase().includes(selectedTrack.toLowerCase()))
      );
      
      if (filteredSessions.length > 0) {
        // Use OpenF1 data
        const session = filteredSessions[0];
        setSessionKey(session.session_key);
        
        const [lapsData, driversData] = await Promise.all([
          getLaps(session.session_key),
          getDrivers(session.session_key)
        ]);
        
        setLaps(lapsData);
        setDrivers(driversData);
      } else {
        // Fallback to mock data
        console.log('Using fallback data for year:', selectedYear);
        const mockData = generateMockRaceData(selectedYear, selectedTrack);
        setLaps(mockData.laps);
        setDrivers(mockData.drivers);
        setSessionKey(999999); // Mock session key
      }
    } catch (e) {
      console.log('OpenF1 failed, using fallback data:', e);
      // Fallback to mock data on error
      const mockData = generateMockRaceData(selectedYear, selectedTrack);
      setLaps(mockData.laps);
      setDrivers(mockData.drivers);
      setSessionKey(999999);
    } finally {
      setLoading(false);
    }
  };

  const generateMockRaceData = (year: string, track: string) => {
    const drivers = [
      { driver_number: 1, full_name: 'Max Verstappen', team_name: 'Red Bull Racing' },
      { driver_number: 11, full_name: 'Sergio Perez', team_name: 'Red Bull Racing' },
      { driver_number: 16, full_name: 'Charles Leclerc', team_name: 'Ferrari' },
      { driver_number: 55, full_name: 'Carlos Sainz', team_name: 'Ferrari' },
      { driver_number: 44, full_name: 'Lewis Hamilton', team_name: 'Mercedes' },
      { driver_number: 63, full_name: 'George Russell', team_name: 'Mercedes' },
      { driver_number: 4, full_name: 'Lando Norris', team_name: 'McLaren' },
      { driver_number: 81, full_name: 'Oscar Piastri', team_name: 'McLaren' },
      { driver_number: 14, full_name: 'Fernando Alonso', team_name: 'Aston Martin' },
      { driver_number: 18, full_name: 'Lance Stroll', team_name: 'Aston Martin' },
      { driver_number: 10, full_name: 'Pierre Gasly', team_name: 'Alpine' },
      { driver_number: 31, full_name: 'Esteban Ocon', team_name: 'Alpine' },
      { driver_number: 23, full_name: 'Alex Albon', team_name: 'Williams' },
      { driver_number: 2, full_name: 'Logan Sargeant', team_name: 'Williams' },
      { driver_number: 77, full_name: 'Valtteri Bottas', team_name: 'Alfa Romeo' },
      { driver_number: 24, full_name: 'Zhou Guanyu', team_name: 'Alfa Romeo' },
      { driver_number: 20, full_name: 'Kevin Magnussen', team_name: 'Haas' },
      { driver_number: 27, full_name: 'Nico Hulkenberg', team_name: 'Haas' },
      { driver_number: 22, full_name: 'Yuki Tsunoda', team_name: 'AlphaTauri' },
      { driver_number: 3, full_name: 'Daniel Ricciardo', team_name: 'AlphaTauri' }
    ];

    const laps = [];
    const baseLapTime = 90 + Math.random() * 20; // 90-110 seconds base
    
    drivers.forEach((driver, driverIndex) => {
      const driverLaps = 50 + Math.floor(Math.random() * 10); // 50-60 laps
      let totalTime = 0;
      
      for (let lapNum = 1; lapNum <= driverLaps; lapNum++) {
        // Simulate lap time with degradation
        const degradation = lapNum * (0.05 + Math.random() * 0.1); // 0.05-0.15s per lap
        const lapTime = baseLapTime + degradation + (Math.random() - 0.5) * 2; // ±1s variation
        
        // Simulate pit stops (every 20-30 laps)
        const pitStopTime = (lapNum % 25 === 0 && lapNum > 20) ? lapTime + 20 + Math.random() * 10 : lapTime;
        
        laps.push({
          lap_number: lapNum,
          driver_number: driver.driver_number,
          duration: pitStopTime,
          tyre: ['SOFT', 'MEDIUM', 'HARD'][Math.floor(Math.random() * 3)]
        });
        
        totalTime += pitStopTime;
      }
    });

    return { laps, drivers };
  };

  const raceData = useMemo(() => {
    if (!laps.length || !drivers.length) return [];
    
    const driverMap = new Map(drivers.map(d => [d.driver_number, d]));
    const driverStats = new Map();
    
    // Group laps by driver
    laps.forEach(lap => {
      if (!lap.driver_number || !lap.duration) return;
      const driverNum = lap.driver_number;
      if (!driverStats.has(driverNum)) {
        driverStats.set(driverNum, {
          driver_number: driverNum,
          driver_name: driverMap.get(driverNum)?.full_name || `Driver ${driverNum}`,
          team_name: driverMap.get(driverNum)?.team_name || 'Unknown',
          laps: [],
          totalTime: 0,
          bestLap: Infinity,
          worstLap: 0,
          stops: 0
        });
      }
      
      const stats = driverStats.get(driverNum);
      stats.laps.push(lap);
      stats.totalTime += lap.duration;
      stats.bestLap = Math.min(stats.bestLap, lap.duration);
      stats.worstLap = Math.max(stats.worstLap, lap.duration);
    });
    
    // Calculate stops (simplified: count laps significantly longer than median)
    driverStats.forEach(stats => {
      const times = stats.laps.map(l => l.duration).sort((a, b) => a - b);
      const median = times[Math.floor(times.length / 2)] || 0;
      stats.stops = times.filter(t => t > median + 10).length;
    });
    
    return Array.from(driverStats.values()).sort((a, b) => a.totalTime - b.totalTime);
  }, [laps, drivers]);

  return (
    <ScrollView 
      contentContainerStyle={styles.scrollContainer} 
      style={{ backgroundColor: '#0b0f16', flex: 1 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerArea}>
        <Text style={styles.appName}>Race Analytics</Text>
        <Text style={styles.subtitle}>Historical race data & driver performance</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Select Year</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {years.map((year) => (
            <TouchableOpacity 
              key={year} 
              style={[styles.chip, selectedYear === year && styles.chipActive]} 
              onPress={() => setSelectedYear(year)}
            >
              <Text style={[styles.chipText, selectedYear === year && styles.chipTextActive]}>{year}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Select Track (Optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <TouchableOpacity 
            style={[styles.chip, selectedTrack === '' && styles.chipActive]} 
            onPress={() => setSelectedTrack('')}
          >
            <Text style={[styles.chipText, selectedTrack === '' && styles.chipTextActive]}>All Tracks</Text>
          </TouchableOpacity>
          {availableTracks.slice(0, 10).map((track) => (
            <TouchableOpacity 
              key={track} 
              style={[styles.chip, selectedTrack === track && styles.chipActive]} 
              onPress={() => setSelectedTrack(track)}
            >
              <Text style={[styles.chipText, selectedTrack === track && styles.chipTextActive]}>{track}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <TouchableOpacity style={styles.searchButton} onPress={handleSearch} disabled={loading}>
        <Text style={styles.searchButtonText}>{loading ? 'Loading...' : 'Search Race Data'}</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator style={{ marginVertical: 20 }} />}
      
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}

      {hasSearched && !loading && raceData.length === 0 && !error && (
        <View style={styles.card}>
          <Text style={styles.resultTitle}>No Data Found</Text>
          <Text style={styles.result}>Try selecting a different year or track.</Text>
        </View>
      )}

      {raceData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.resultTitle}>Race Results - {selectedYear}</Text>
          <Text style={styles.resultSubtitle}>
            {selectedTrack ? `${selectedTrack} Grand Prix` : 'All Races'} • {raceData.length} drivers
          </Text>
          <View style={styles.tableWrapper}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={true} 
              style={styles.tableHorizontalScroll}
              contentContainerStyle={styles.tableHorizontalContent}
            >
              <ScrollView 
                vertical 
                showsVerticalScrollIndicator={true} 
                style={styles.tableVerticalScroll}
                contentContainerStyle={styles.tableVerticalContent}
              >
                <View style={styles.table}>
                  <View style={styles.tableHeader}>
                    <Text style={styles.tableHeaderText}>Pos</Text>
                    <Text style={styles.tableHeaderText}>Driver</Text>
                    <Text style={styles.tableHeaderText}>Team</Text>
                    <Text style={styles.tableHeaderText}>Total Time</Text>
                    <Text style={styles.tableHeaderText}>Best Lap</Text>
                    <Text style={styles.tableHeaderText}>Stops</Text>
                  </View>
                  {raceData.map((driver, index) => (
                    <View key={driver.driver_number} style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}>
                      <Text style={styles.tableCell}>{index + 1}</Text>
                      <Text style={styles.tableCellDriver}>{driver.driver_name}</Text>
                      <Text style={styles.tableCell}>{driver.team_name}</Text>
                      <Text style={styles.tableCellTime}>{formatSeconds(driver.totalTime)}</Text>
                      <Text style={styles.tableCellTime}>{formatSeconds(driver.bestLap)}</Text>
                      <Text style={styles.tableCellStops}>{driver.stops}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </ScrollView>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer theme={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: '#0b0f16' } }}>
      <Tab.Navigator 
        screenOptions={{ 
          headerShown: false, 
          tabBarStyle: { 
            backgroundColor: '#0b0f16', 
            borderTopColor: '#1f2937',
            height: 60,
            paddingBottom: 8,
            paddingTop: 8
          }, 
          tabBarActiveTintColor: '#22c55e', 
          tabBarInactiveTintColor: '#94a3b8',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600'
          }
        }}
      >
        <Tab.Screen 
          name="Strategy" 
          component={StrategyScreen}
          options={{
            tabBarIcon: ({ focused, color, size }) => (
              <Image 
                source={require('./assets/prediction.png')} 
                style={{ 
                  width: size || 24, 
                  height: size || 24, 
                  tintColor: focused ? '#22c55e' : '#94a3b8',
                  opacity: focused ? 1 : 0.7
                }} 
              />
            ),
          }}
        />
        <Tab.Screen 
          name="Analytics" 
          component={TelemetryScreen}
          options={{
            tabBarIcon: ({ focused, color, size }) => (
              <Image 
                source={require('./assets/analytics.png')} 
                style={{ 
                  width: size || 24, 
                  height: size || 24, 
                  tintColor: focused ? '#22c55e' : '#94a3b8',
                  opacity: focused ? 1 : 0.7
                }} 
              />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: 20,
  },
  headerArea: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  subtitle: {
    color: '#94a3b8',
    marginTop: 4,
  },
  input: {
    width: '90%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    marginBottom: 12,
    color: '#e5e7eb',
    backgroundColor: '#0f172a',
  },
  label: {
    width: '90%',
    marginBottom: 6,
    color: '#9ca3af',
  },
  card: {
    width: '92%',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 8,
    color: '#cbd5e1',
  },
  chipsRow: {
    paddingVertical: 4,
  },
  suggestBox: {
    width: '92%',
    backgroundColor: '#0b1220',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: -6,
    marginBottom: 8,
    overflow: 'hidden',
  },
  suggestItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  suggestText: {
    color: '#cbd5e1',
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 8,
    backgroundColor: '#0b1220',
  },
  chipActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  chipText: {
    color: '#cbd5e1',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  ctaButton: {
    marginTop: 8,
    width: '92%',
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: '#0b0f16',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  searchButton: {
    marginTop: 16,
    marginBottom: 8,
    width: '92%',
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#0b0f16',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  result: {
    marginTop: 12,
    width: '90%',
    fontSize: 16,
    color: '#e5e7eb',
  },
  resultCard: {
    width: '92%',
    backgroundColor: '#0b1220',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  resultTitle: {
    fontWeight: '600',
    marginBottom: 6,
    color: '#cbd5e1',
  },
  resultSubtitle: {
    color: '#94a3b8',
    marginBottom: 12,
    fontSize: 14,
  },
  error: {
    marginTop: 12,
    width: '90%',
    color: '#f87171',
  },
  errorCard: {
    width: '92%',
    backgroundColor: '#2b1111',
    borderColor: '#7f1d1d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  modeHint: {
    marginTop: 6,
    color: '#94a3b8',
  },
  stintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stintBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
    backgroundColor: '#475569',
  },
  badgeSoft: { backgroundColor: '#ef4444' },
  badgeMedium: { backgroundColor: '#f59e0b' },
  badgeHard: { backgroundColor: '#22c55e' },
  tableWrapper: {
    maxHeight: 400,
    width: '100%',
  },
  tableHorizontalScroll: {
    maxHeight: 400,
  },
  tableHorizontalContent: {
    minWidth: 600,
  },
  tableVerticalScroll: {
    maxHeight: 400,
  },
  tableVerticalContent: {
    flexGrow: 1,
  },
  table: {
    minWidth: 600,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tableHeaderText: {
    flex: 1,
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 12,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    backgroundColor: '#0f172a',
  },
  tableRowEven: {
    backgroundColor: '#1e293b',
  },
  tableCell: {
    flex: 1,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '500',
  },
  tableCellDriver: {
    flex: 1.5,
    color: '#22c55e',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
  tableCellTime: {
    flex: 1,
    color: '#fbbf24',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
  tableCellStops: {
    flex: 0.8,
    color: '#ef4444',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
  },
});
