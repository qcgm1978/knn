import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import * as d3 from 'd3';
import { hexbin } from 'd3-hexbin';

interface Penguin {
  species: string;
  bill_length_mm: number;
  bill_depth_mm: number;
}

const App: React.FC = () => {
  const [data, setData] = useState<Penguin[]>([]);
  const [k, setK] = useState<number>(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const videoRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch('https://raw.githubusercontent.com/allisonhorst/palmerpenguins/master/inst/extdata/penguins.csv');
      const reader = response.body?.getReader();
      const result = await reader?.read();
      const decoder = new TextDecoder('utf-8');
      const csv = decoder.decode(result?.value);
      const { data } = Papa.parse(csv, { header: true, dynamicTyping: true });
      setData(data as Penguin[]);
    };

    fetchData();
  }, []);

  const drawVisualization = (currentK: number) => {
    if (!data.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const height = 600;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };

    svg.attr("width", width).attr("height", height);

    const x = d3.scaleLinear()
      .domain([d3.min(data, d => d.bill_length_mm) as number - 5, d3.max(data, d => d.bill_length_mm) as number + 5])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([d3.min(data, d => d.bill_depth_mm) as number - 5, d3.max(data, d => d.bill_depth_mm) as number + 5])
      .range([height - margin.bottom, margin.top]);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const hexbinGenerator = hexbin()
      .x(d => x(d[0]))
      .y(d => y(d[1]))
      .radius(10)
      .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]]);

    // Limit the data to the first currentK points
    const limitedData = data.slice(0, currentK);
    const points = limitedData.map(d => [d.bill_length_mm, d.bill_depth_mm]);

    const bins = hexbinGenerator(points);

    // Create a grid of hexagon centers
    const hexPoints = hexbinGenerator.centers();

    // Classify each hexagon center using KNN
    const classifyPoint = (point: [number, number]) => {
        const distances = limitedData.map(d => ({
            species: d.species,
            distance: Math.sqrt(Math.pow(d.bill_length_mm - point[0], 2) + Math.pow(d.bill_depth_mm - point[1], 2))
        }));
        distances.sort((a, b) => a.distance - b.distance);
        const nearestNeighbors = distances.slice(0, currentK);
        const speciesCount = d3.rollup(nearestNeighbors, v => v.length, d => d.species);
        return Array.from(speciesCount).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    };

    // Draw the decision boundary using hexagons
    svg.append("g")
      .selectAll("path")
      .data(hexPoints)
      .enter().append("path")
      .attr("d", hexbinGenerator.hexagon())
      .attr("transform", d => `translate(${x(d[0])},${y(d[1])})`)
      .attr("fill", d => color(classifyPoint(d)));

    // Draw the hexbin visualization
    svg.append("g")
      .selectAll("path")
      .data(bins)
      .enter().append("path")
      .attr("d", hexbinGenerator.hexagon())
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("fill", d => {
          const speciesCount = d3.rollup(d, v => v.length, d => d.species);
          const maxSpecies = Array.from(speciesCount).reduce((a, b) => a[1] > b[1] ? a : b)[0];
          return color(maxSpecies as string);
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", "1px");

    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x));

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 5)
      .attr("text-anchor", "middle")
      .text("Bill Length (mm)");

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", 15)
      .attr("text-anchor", "middle")
      .text("Bill Depth (mm)");

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .text(`k = ${currentK}`);
  };

  const animate = () => {
    setK(prevK => {
      if (prevK < 100) {
        animationRef.current = requestAnimationFrame(animate);
        return prevK + 1; // 使用函数式更新
      } else {
        setIsPlaying(false);
        return prevK; // 不改变 k 的值
      }
    });
  };

  useEffect(() => {
    drawVisualization(k);
  }, [data, k]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (event.metaKey && event.code === 'Enter') {
        event.preventDefault();
        if (videoRef.current) {
          if (!isFullscreen) {
            videoRef.current.contentWindow?.postMessage('{"event":"fullscreen"}', '*');
            setIsFullscreen(true);
          } else {
            document.exitFullscreen();
            setIsFullscreen(false);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (isPlaying) {
      setK(1);
      animationRef.current = requestAnimationFrame(animate);
      if (videoRef.current) {
        videoRef.current.contentWindow?.postMessage('{"event":"play"}', '*');
      }
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (videoRef.current) {
        videoRef.current.contentWindow?.postMessage('{"event":"pause"}', '*');
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-4">KNN Decision Boundary Visualization</h1>
      <div className="mb-4">
        <label htmlFor="k-slider" className="mr-2">
          Number of nearest neighbors (k):
        </label>
        <input
          id="k-slider"
          type="range"
          min="1"
          max="100"
          value={k}
          onChange={(e) => {
            const newValue = parseInt(e.target.value);
            if (newValue <= 100) { // Ensure the value does not exceed max
              setK(newValue);
            }
          }}
          className="w-64"
        />
        <span className="ml-2">{k}</span>
      </div>
      <svg ref={svgRef} className="bg-white shadow-lg rounded-lg"></svg>
      
      <iframe
        ref={videoRef}
        src="//player.bilibili.com/player.html?bvid=BV1nm411Q7vW&page=1&autoplay=0"
        scrolling="no"
        border="0"
        frameBorder="no"
        framespacing="0"
        allowFullScreen={true}
        className="w-0 h-0 absolute"
        style={{ visibility: 'hidden' }}
      ></iframe>
      <p className="mt-4 text-sm text-gray-600">
        Press Space to play/pause the animation and video. Press Cmd+Enter to show/hide the Bilibili video in fullscreen.
      </p>
    </div>
  );
};

export default App;
