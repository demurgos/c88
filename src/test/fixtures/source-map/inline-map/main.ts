interface Greeting {
  name: string;
}

// @ts-ignore
function hello({name}: Greeting): void {
  console.log(`Hello, ${name}!`);
}

hello({name: "c88"});
