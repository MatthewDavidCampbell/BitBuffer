/**
 * Copyright 2013 Observit AB
 * 
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

var bitbuffer = module.exports = function(buffer) {
	/**
	 * No buffer/null then empty
	 */
	if (Buffer.isBuffer(buffer)) {
		this._buffer = buffer;
	} else {
		this._buffer = new Buffer(0);
	}

	this.position = 0; // position is the bit position
	this.limit = this._buffer.length * 8; // buffer limit in bits
};

/**
 * Read bit from current position, with size a argument reads shifted together.
 * Reading from right to left
 * 
 * @param [size]
 * @returns bit value (integer 0 or 1)
 */
bitbuffer.prototype.read = function(size) {
	if (size === undefined)
		return next.call(this);

	size = ~~size; // round down numbers to integers
	if (size === 0 || (this.position + size) > this.limit)
		return null;

	return fuse.call(this, size);
};

/**
 * Write bits to buffer of a specific size which means zero padding from the
 * left. Function moves the position to the size plus itself then the value is
 * read off bit-by-bit from left to right masking the buffer. Bits are saved by
 * saving the entire byte.
 * 
 * @param number
 * @param size
 * @param position
 * @returns
 */
bitbuffer.prototype.write = function(value, size) {
	value = ~~value;
	size = ~~size;

	/**
	 * determine number of bits to house the value
	 */
	if (value.toString(2).length > size)
		return;

	if (this.position + size > this.limit)
		return;

	var mask = 1;
	var end = this.position + size - 1;

	for (var index = end; index >= this.position; index--) {
		var bit = value & mask; // is end bit active?
		value >>= 1; // shift value left by one ready for the next loop

		var offset = ~~(index / 8);
		var rightmost = 7 - (index % 8);

		/**
		 * move the new bit mask to the correct position then bitwise "or" which
		 * meaning if the current bit is active then it stays active.
		 */
		this._buffer[offset] = this._buffer[offset] | (bit << rightmost);
	}
	this.position = end + 1;
};

/**
 * Cavlc == plain old read
 */
bitbuffer.prototype.cavlc = function(size) {
	if (size === undefined)
		return null;

	return read(size);
};

/**
 * Cavlc UE read according to the Golomb coding
 * http://x264dev.multimedia.cx/archives/category/exponential-golomb-codes
 * 
 */
bitbuffer.prototype.cavlcUE = function() {
	var cnt = 0;
	while (this.read() === 0)
		cnt++;

	var res = 0;
	if (cnt > 0) {
		var val = this.read(cnt); // find first active bit at offset

		/**
		 * ~~ == Math.floor()
		 */
		res = ~~((1 << cnt) - 1 + val);
	}

	return res;
};

/**
 * cavlc SE (signed) read
 * 
 * @returns
 */
bitbuffer.prototype.cavlcSE = function() {
	var val = this.cavlcUE();

	var sign = ((val & 0x1) << 1) - 1;
	val = ((val >> 1) + (val & 0x1)) * sign;

	return val;
};

/**
 * cavlc TE
 */
bitbuffer.prototype.cavlcTE = function(max) {
	if (max === undefined)
		return null;

	if (max > 1)
		return this.cavlcUE();

	return ~this.read() & 0x1;
};

/**
 * cavlc ME
 * 
 * @returns
 */
bitbuffer.prototype.cavlcME = function() {
	return this.cavlcUE();
};

/**
 * PPS processing
 */
bitbuffer.prototype.cavlcMoreRBSP = function() {
	var nBit = this.position % 8;

	if (this.position >= this.limit || this.position === 0)
		return false;

	if (nBit === 0)
		this.position++;

	var tail = 1 << (8 - nBit - 1);
	var mask = ((tail << 1) - 1);

	var curByte = currentByte.call(this);
	var hasTail = (curByte & mask) == tail;

	var nByte = nextByte.call(this);
	return !(curByte == -1 || (nByte == -1 && hasTail));
};

/**
 * Get current position
 * 
 * @return {Number}
 */
bitbuffer.prototype.getPosition = function() {
	return this.position;
};

/**
 * Set position
 * 
 * @param position
 */
bitbuffer.prototype.setPosition = function(position) {
	this.position = position;
};

/**
 * Set offset (which really sets the position to the head of the byte offset)
 * 
 * @param offset
 */
bitbuffer.prototype.setOffset = function(offset) {
	offset = ~~offset;

	if (offset > this._buffer.length)
		return null;

	this.position = offset * 8;
};

/**
 * Get buffer size/limit
 * 
 * @return size in bits
 */
bitbuffer.prototype.getLimit = function() {
	return this.limit;
};

/**
 * Is bit aligned
 * 
 * @return true|false
 */
bitbuffer.prototype.isAligned = function() {
	return this.position % 8 === 0 ? true : false;
};

/**
 * Gets underlying buffer
 * 
 * @returns {Buffer}
 */
bitbuffer.prototype.getBuffer = function() {
	return this._buffer;
};

/**
 * Read from current position then advance position
 * 
 * @returns {bit}
 */
function next() {
	if (this.position >= this.limit)
		return null;

	var offset = ~~(this.position / 8);
	var remainder = this.position % 8;

	/**
	 * Shifts the bit at current position to the end and masks 0b0001 if it is
	 * on or off
	 */
	var result = (this._buffer[offset] >> (7 - remainder)) & 1;
	this.position++;

	return result;
}

/**
 * Current byte in relation to position
 * 
 * @returns {byte}
 */
function currentByte() {
	var offset = ~~(this.position / 8);

	return this._buffer[offset];
}

/**
 * Next byte in the relation to current position
 * 
 * @returns {byte}
 */
function nextByte() {
	var offset = ~~(this.position / 8) + 1;

	if (offset >= this._buffer.length)
		return null;

	return this._buffer[offset];
}

/**
 * Fuses together several read call by shifting left individual bits
 * 
 * @param size
 * @returns {Number}
 */
function fuse(size) {
	var value = 0;

	/**
	 * Shift assignment to left (ex. 14 is 0b00001110 <<= 2 becomes 56
	 * 0b00111000) then read next bit as a bitwise OR (effectively setting the
	 * tailing bit as next)
	 */
	for (var index = 0; index < size; index++) {
		value <<= 1;
		value |= next.call(this);
	}

	return value;
}